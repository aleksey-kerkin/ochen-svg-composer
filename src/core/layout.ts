import { FORMATS } from '../model/formats.ts';
import type {
  FormatId,
  LayoutTemplate,
  PlacedObject,
  Size,
  Slot2D,
} from '../model/types.ts';
import {
  arrangeMains,
  frameCloseUp,
  orderByDepth,
  placeEdgeBackgrounds,
} from './arrange.ts';
import { axisBox, crossesFrame } from './geometry.ts';

export type TemplateId = LayoutTemplate['id'];

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  'under-title': 'Под заголовком',
  offset: 'Со смещением',
  compact: 'Плотно',
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
  // Short side is 1080. Large enough that a book fills the width, and still
  // leaves a band where a second main or a monochrome background can show.
  square: 0.72,
  portrait: 0.72,
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

const EDGE_SLOTS: Slot2D[] = [
  { x: 1.04, y: 0.16, rotation: -8 },
  { x: -0.06, y: 0.86, rotation: 7 },
  { x: 0.12, y: 1.04, rotation: 4 },
];

function pushOutside(
  object: PlacedObject,
  frame: { w: number; h: number },
  scale: number,
): void {
  const box = axisBox(object, scale);
  if (crossesFrame(box, frame)) return;
  const left = box.x;
  const right = frame.w - (box.x + box.w);
  const top = box.y;
  const bottom = frame.h - (box.y + box.h);
  const nearest = Math.min(left, right, top, bottom);
  if (nearest === left) object.x -= left + 12;
  else if (nearest === right) object.x += right + 12;
  else if (nearest === top) object.y -= top + 12;
  else object.y += bottom + 12;
}

function placeBackgrounds(
  objects: PlacedObject[],
  template: LayoutTemplate,
  random: () => number,
  frame: { w: number; h: number },
): PlacedObject[] {
  const slotted = place(
    objects,
    template.backgroundSlots,
    () => 0,
    random,
    frame,
  );
  const extra = objects
    .slice(template.backgroundSlots.length)
    .map((object, index) => {
      const edge = EDGE_SLOTS[index % EDGE_SLOTS.length];
      if (!edge) return object;
      const next: PlacedObject = {
        uid: object.uid,
        objectId: object.objectId,
        role: object.role,
        x: (edge.x + (random() * 2 - 1) * JITTER) * frame.w,
        y: (edge.y + (random() * 2 - 1) * JITTER) * frame.h,
        rotation: edge.rotation ?? 0,
        z: 0,
      };
      if (object.colorShift !== undefined) next.colorShift = object.colorShift;
      return next;
    });
  const placed = [...slotted, ...extra];
  for (const object of placed) pushOutside(object, frame, template.scale);
  return placed;
}

export interface LaidOutScene {
  scale: number;
  objects: PlacedObject[];
}

/**
 * L sizes the hero to about 82% of the frame's limiting side (the middle of
 * 75–90%). S is about 72% (the middle of 65–80%). The hero may bleed.
 */
export function groupFillTarget(size: Size): number {
  return size === 'S' ? 0.72 : 0.82;
}

/**
 * Sizes the hero first, then seats at most one secondary tight against it
 * (two on landscape). Secondaries share the hero's scale and are cropped by
 * the frame to about half their box. Riders stay on their support.
 */
export function layoutScene(
  objects: PlacedObject[],
  template: LayoutTemplate,
  seed: number,
  size: Size = 'L',
): LaidOutScene {
  const target = groupFillTarget(size);
  const base = layout(objects, template, seed);
  const mains = base
    .filter((object) => object.role === 'main')
    .map((object) => ({ ...object }));
  if (mains.length === 0) {
    return { scale: template.scale, objects: base };
  }
  const backgrounds = base
    .filter((object) => object.role === 'background')
    .map((object) => ({ ...object }));
  return frameCloseUp(mains, backgrounds, template, template.scale, target);
}

/** Puts every scene object into the template. Mains are not dropped. */
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
  const placedMains =
    mains.length <= 1
      ? place(mains, template.mainSlots, () => 0, random, frame)
      : arrangeMains(mains, template, random);
  const placedBackgrounds =
    mains.length === 0
      ? placeBackgrounds(backgrounds, template, random, frame)
      : placeEdgeBackgrounds(backgrounds, placedMains, template, random);
  return orderByDepth(placedBackgrounds, placedMains, template.scale);
}
