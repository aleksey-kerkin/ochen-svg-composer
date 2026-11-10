import { ensureBackdrop } from '../core/backdrop.ts';
import { layout, templateById, type TemplateId } from '../core/layout.ts';
import manifestJson from '../library/manifest.json' with { type: 'json' };
import { FORMATS } from '../model/formats.ts';
import { defaultScale, shortSide } from '../model/scale.ts';
import type {
  Composition,
  FormatId,
  Manifest,
  PlacedObject,
  Role,
  Size,
} from '../model/types.ts';

export type CompositionAction =
  | { type: 'add'; objectId: string; role: Role }
  | { type: 'move'; uid: string; dx: number; dy: number }
  | { type: 'rotate'; uid: string; deg: number }
  | { type: 'duplicate'; uid: string }
  | { type: 'remove'; uid: string }
  | { type: 'bringForward'; uid: string }
  | { type: 'sendBackward'; uid: string }
  | { type: 'select'; uid?: string }
  | { type: 'setFormat'; format: FormatId }
  | { type: 'setTemplate'; templateId: TemplateId }
  | { type: 'setWithBackgrounds'; enabled: boolean }
  | { type: 'setSize'; size: Size }
  | { type: 'setScale'; scale: number }
  | { type: 'setPalette'; paletteId: string }
  | { type: 'toggleRole'; uid: string }
  | { type: 'cycleColors'; uid: string }
  | { type: 'reseed' };

const knownObjectIds = new Set(
  (manifestJson as Manifest).items.map((item) => item.objectId),
);

export function initialComposition(): Composition {
  return {
    format: 'landscape',
    size: 'L',
    paletteId: 'lilac',
    scale: defaultScale('landscape'),
    objects: [],
    seed: 1,
    withBackgrounds: true,
  };
}

export function reduceComposition(
  state: Composition,
  action: CompositionAction,
): Composition {
  switch (action.type) {
    case 'add':
      return addObject(state, action.objectId, action.role);
    case 'move':
      return updateObject(state, action.uid, (object) => ({
        ...object,
        x: object.x + action.dx,
        y: object.y + action.dy,
      }));
    case 'rotate':
      // Degrees are absolute so a slider can set the angle in one call.
      return updateObject(state, action.uid, (object) => ({
        ...object,
        rotation: action.deg,
      }));
    case 'duplicate':
      return duplicateObject(state, action.uid);
    case 'remove':
      return removeObject(state, action.uid);
    case 'bringForward':
      return stepZ(state, action.uid, 1);
    case 'sendBackward':
      return stepZ(state, action.uid, -1);
    case 'select':
      return selectObject(state, action.uid);
    case 'setFormat':
      return changeFormat(state, action.format);
    case 'setTemplate':
      return applyTemplate(state, action.templateId);
    case 'setWithBackgrounds':
      return changeBackdrop(state, action.enabled);
    case 'setScale':
      if (!Number.isFinite(action.scale) || action.scale <= 0) {
        throw new Error('scale must be a positive number');
      }
      return { ...state, scale: action.scale };
    case 'setSize':
      return state.size === action.size
        ? state
        : { ...state, size: action.size };
    case 'setPalette':
      return state.paletteId === action.paletteId
        ? state
        : { ...state, paletteId: action.paletteId };
    case 'toggleRole':
      return updateObject(state, action.uid, (object) => ({
        ...object,
        role: object.role === 'main' ? 'background' : 'main',
      }));
    case 'cycleColors':
      return updateObject(state, action.uid, (object) => {
        if (object.role !== 'main') return object;
        const next = (((object.colorShift ?? 0) + 1) % 3) as 0 | 1 | 2;
        if (next === 0) {
          const rest = { ...object };
          delete rest.colorShift;
          return rest;
        }
        return { ...object, colorShift: next };
      });
    case 'reseed':
      return { ...state, seed: state.seed + 1 };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

function changeFormat(state: Composition, format: FormatId): Composition {
  if (state.format === format) return state;
  if (state.templateId) {
    const template = templateById(state.templateId, format);
    const next = { ...state, format };
    return keepSelection({
      ...next,
      scale: template.scale,
      objects: layout(objectsForTemplate(next), template, state.seed),
    });
  }
  const ratio = shortSide(format) / shortSide(state.format);
  const scale = state.scale * ratio;
  const from = FORMATS[state.format];
  const to = FORMATS[format];
  return {
    ...state,
    format,
    scale,
    objects: state.objects.map((object) => ({
      ...object,
      x: (object.x / from.w) * to.w,
      y: (object.y / from.h) * to.h,
    })),
  };
}

function objectsForTemplate(state: Composition): PlacedObject[] {
  if (state.withBackgrounds === false) {
    return state.objects.filter((object) => object.role === 'main');
  }
  return ensureBackdrop(state.objects, state.format);
}

function applyTemplate(
  state: Composition,
  templateId: TemplateId,
): Composition {
  const template = templateById(templateId, state.format);
  const next = { ...state, templateId };
  return keepSelection({
    ...next,
    scale: template.scale,
    objects: layout(objectsForTemplate(next), template, state.seed),
  });
}

function changeBackdrop(state: Composition, enabled: boolean): Composition {
  const next = { ...state, withBackgrounds: enabled };
  if (state.templateId) return applyTemplate(next, state.templateId);
  const objects = enabled
    ? ensureBackdrop(state.objects, state.format)
    : state.objects.filter((object) => object.role === 'main');
  return { ...next, objects };
}

function keepSelection(state: Composition): Composition {
  if (
    state.selectedUid !== undefined &&
    !state.objects.some((object) => object.uid === state.selectedUid)
  ) {
    const next: Composition = { ...state };
    delete next.selectedUid;
    return next;
  }
  return state;
}

function addObject(
  state: Composition,
  objectId: string,
  role: Role,
): Composition {
  if (!knownObjectIds.has(objectId)) {
    throw new Error(`Unknown objectId: ${objectId}`);
  }
  const frame = FORMATS[state.format];
  const z =
    state.objects.reduce((max, object) => Math.max(max, object.z), -1) + 1;
  const object: PlacedObject = {
    uid: nextUid(state.objects),
    objectId,
    role,
    x: frame.w / 2,
    y: frame.h / 2,
    rotation: 0,
    z,
  };
  return { ...state, objects: [...state.objects, object] };
}

function duplicateObject(state: Composition, uid: string): Composition {
  const source = state.objects.find((object) => object.uid === uid);
  if (!source) return state;
  const z = source.z + 1;
  // Spec offset is 24px. Shift both axes so the copy does not sit on the source.
  const copy: PlacedObject = {
    ...source,
    uid: nextUid(state.objects),
    x: source.x + 24,
    y: source.y + 24,
    z,
  };
  const objects = state.objects.map((object) =>
    object.z >= z ? { ...object, z: object.z + 1 } : object,
  );
  objects.push(copy);
  return { ...state, objects };
}

function removeObject(state: Composition, uid: string): Composition {
  if (!state.objects.some((object) => object.uid === uid)) return state;
  const objects = state.objects.filter((object) => object.uid !== uid);
  if (state.selectedUid !== uid) return { ...state, objects };
  const next: Composition = { ...state, objects };
  delete next.selectedUid;
  return next;
}

function selectObject(
  state: Composition,
  uid: string | undefined,
): Composition {
  if (uid === undefined) {
    if (state.selectedUid === undefined) return state;
    const next: Composition = { ...state };
    delete next.selectedUid;
    return next;
  }
  if (!state.objects.some((object) => object.uid === uid)) return state;
  return { ...state, selectedUid: uid };
}

function stepZ(
  state: Composition,
  uid: string,
  direction: 1 | -1,
): Composition {
  const current = state.objects.find((object) => object.uid === uid);
  if (!current) return state;
  const candidates = state.objects.filter((object) =>
    direction > 0 ? object.z > current.z : object.z < current.z,
  );
  candidates.sort((left, right) =>
    direction > 0 ? left.z - right.z : right.z - left.z,
  );
  const neighbor = candidates[0];
  if (!neighbor) return state;
  return {
    ...state,
    objects: state.objects.map((object) => {
      if (object.uid === current.uid) return { ...object, z: neighbor.z };
      if (object.uid === neighbor.uid) return { ...object, z: current.z };
      return object;
    }),
  };
}

function updateObject(
  state: Composition,
  uid: string,
  update: (object: PlacedObject) => PlacedObject,
): Composition {
  if (!state.objects.some((object) => object.uid === uid)) return state;
  return {
    ...state,
    objects: state.objects.map((object) =>
      object.uid === uid ? update(object) : object,
    ),
  };
}

function nextUid(objects: PlacedObject[]): string {
  let max = 0;
  for (const object of objects) {
    const match = /^obj-(\d+)$/.exec(object.uid);
    if (match?.[1]) max = Math.max(max, Number(match[1]));
  }
  return `obj-${max + 1}`;
}
