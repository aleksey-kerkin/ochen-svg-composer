import { FORMATS } from '../model/formats.ts';
import type {
  FormatId,
  LayoutTemplate,
  PlacedObject,
  Slot2D,
} from '../model/types.ts';

export type TemplateId = LayoutTemplate['id'];

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  'under-title': 'Под заголовком',
  offset: 'Со смещением',
  compact: 'Собранно',
};

const TEMPLATE_IDS: TemplateId[] = ['under-title', 'offset', 'compact'];

/** ±3% of the frame, in slot fractions. */
const JITTER = 0.03;

/**
 * One L-unit scale per format. Large enough that a book covers most of
 * the frame and crops at the edge. Square and portrait share a scale
 * because they share the 1080 short side.
 */
const TEMPLATE_SCALE: Record<FormatId, number> = {
  landscape: 0.74,
  square: 1.05,
  portrait: 1.05,
};

const TITLE_SAFE = { x: 0, y: 0, w: 1, h: 0.4 };

/**
 * Fractions differ per format, so a format change recomposes the scene
 * instead of stretching the previous pixel positions.
 * Offset always keeps one center outside the frame.
 */
const TEMPLATES: LayoutTemplate[] = [
  slot('under-title', 'landscape', {
    main: [{ x: 0.55, y: 0.64, rotation: -8 }],
    background: [
      { x: 0.24, y: 0.78, rotation: 6 },
      { x: 0.8, y: 0.7, rotation: -4 },
    ],
    safeArea: TITLE_SAFE,
  }),
  slot('under-title', 'square', {
    main: [{ x: 0.5, y: 0.68, rotation: 7 }],
    background: [
      { x: 0.24, y: 0.56, rotation: -10 },
      { x: 0.76, y: 0.8, rotation: 5 },
    ],
    safeArea: TITLE_SAFE,
  }),
  slot('under-title', 'portrait', {
    main: [{ x: 0.5, y: 0.74, rotation: -9 }],
    background: [
      { x: 0.28, y: 0.52, rotation: 8 },
      { x: 0.74, y: 0.88, rotation: -6 },
    ],
    safeArea: TITLE_SAFE,
  }),
  slot('offset', 'landscape', {
    main: [
      { x: -0.05, y: 0.48, rotation: -8 },
      { x: 0.64, y: 0.56, rotation: 10 },
    ],
    background: [{ x: 0.42, y: 1.06, rotation: 6 }],
  }),
  slot('offset', 'square', {
    main: [
      { x: -0.05, y: 0.46, rotation: -8 },
      { x: 0.66, y: 0.62, rotation: 12 },
    ],
    background: [{ x: 1.06, y: 0.4, rotation: 4 }],
  }),
  slot('offset', 'portrait', {
    main: [
      { x: 0.46, y: 0.28, rotation: -6 },
      { x: 0.58, y: 0.74, rotation: 11 },
    ],
    background: [{ x: 1.06, y: 0.5, rotation: -8 }],
  }),
  slot('compact', 'landscape', {
    main: [
      { x: 0.34, y: 0.42, rotation: -8 },
      { x: 0.62, y: 0.5, rotation: 12 },
      { x: 0.48, y: 0.64, rotation: 4 },
    ],
    background: [
      { x: 0.16, y: 0.22, rotation: 16 },
      { x: 0.82, y: 0.3, rotation: -11 },
    ],
  }),
  slot('compact', 'square', {
    main: [
      { x: 0.36, y: 0.38, rotation: -6 },
      { x: 0.64, y: 0.46, rotation: 9 },
      { x: 0.5, y: 0.64, rotation: 5 },
    ],
    background: [
      { x: 0.16, y: 0.18, rotation: 14 },
      { x: 0.82, y: 0.8, rotation: -8 },
    ],
  }),
  slot('compact', 'portrait', {
    main: [
      { x: 0.4, y: 0.32, rotation: -7 },
      { x: 0.62, y: 0.52, rotation: 10 },
      { x: 0.42, y: 0.72, rotation: 4 },
    ],
    background: [
      { x: 0.2, y: 0.16, rotation: 15 },
      { x: 0.78, y: 0.86, rotation: -12 },
    ],
  }),
];

function slot(
  id: TemplateId,
  format: FormatId,
  parts: {
    main: Slot2D[];
    background: Slot2D[];
    safeArea?: LayoutTemplate['safeArea'];
  },
): LayoutTemplate {
  const template: LayoutTemplate = {
    id,
    format,
    mainSlots: parts.main,
    backgroundSlots: parts.background,
    scale: TEMPLATE_SCALE[format],
  };
  if (parts.safeArea) template.safeArea = parts.safeArea;
  return template;
}

export function templateById(id: TemplateId, format: FormatId): LayoutTemplate {
  const template = TEMPLATES.find(
    (entry) => entry.id === id && entry.format === format,
  );
  if (!template) throw new Error(`Unknown template ${id} for ${format}`);
  return template;
}

export function templateIds(): TemplateId[] {
  return TEMPLATE_IDS;
}

function rank(objects: PlacedObject[]): PlacedObject[] {
  return [...objects].sort(
    (left, right) => right.z - left.z || left.uid.localeCompare(right.uid),
  );
}

function unit(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function place(
  objects: PlacedObject[],
  slots: Slot2D[],
  zAt: (index: number) => number,
  random: () => number,
  frame: { w: number; h: number },
): PlacedObject[] {
  return objects.slice(0, slots.length).map((object, index) => {
    const target = slots[index];
    if (!target) return object;
    const next: PlacedObject = {
      uid: object.uid,
      objectId: object.objectId,
      role: object.role,
      x: (target.x + (random() * 2 - 1) * JITTER) * frame.w,
      y: (target.y + (random() * 2 - 1) * JITTER) * frame.h,
      rotation: target.rotation ?? 0,
      z: zAt(index),
    };
    if (object.colorShift !== undefined) next.colorShift = object.colorShift;
    return next;
  });
}

/** Puts current scene objects into the template. Extra objects are dropped. */
export function layout(
  objects: PlacedObject[],
  template: LayoutTemplate,
  seed: number,
): PlacedObject[] {
  const frame = FORMATS[template.format];
  const random = unit(seed);
  const mains = rank(objects.filter((object) => object.role === 'main'));
  const backgrounds = rank(
    objects.filter((object) => object.role === 'background'),
  );
  const mainCount = Math.min(mains.length, template.mainSlots.length);
  const backgroundCount = Math.min(
    backgrounds.length,
    template.backgroundSlots.length,
  );
  const placedMains = place(
    mains,
    template.mainSlots,
    (index) => backgroundCount + (mainCount - 1 - index),
    random,
    frame,
  );
  const placedBackgrounds = place(
    backgrounds,
    template.backgroundSlots,
    (index) => backgroundCount - 1 - index,
    random,
    frame,
  );
  return [...placedBackgrounds, ...placedMains].sort(
    (left, right) => left.z - right.z,
  );
}
