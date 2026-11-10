import type { Box } from './geometry.ts';

/**
 * Where an object may sit in a group. Supports are the ground plane other
 * objects can lie on. Top items prefer a support's face. Side items only
 * stand beside the group.
 */
export type PlacementAnchor = 'support' | 'top' | 'side';

export interface PlacementProfile {
  objectId: string;
  /** Ids allowed to lie fully on this object's top face. */
  partners: readonly string[];
  /** Top face, as fractions of the axis-aligned box. */
  face: { x: number; y: number; w: number; h: number };
  /** Solid body used for beside-gaps, as fractions of the axis-aligned box. */
  footprint: { x: number; y: number; w: number; h: number };
  anchor: PlacementAnchor;
}

const FULL = { x: 0, y: 0, w: 1, h: 1 };
const NO_FACE = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Faces are fractions of the L asset box, so they stay valid at any shared
 * scale. A partner is listed only when its L box fits inside the face.
 */
export const PLACEMENT: Record<string, PlacementProfile> = {
  book: {
    objectId: 'book',
    partners: ['phone', 'puzzle', 'pen', 'coin'],
    face: { x: 0.14, y: 0.08, w: 0.72, h: 0.52 },
    footprint: FULL,
    anchor: 'support',
  },
  folder: {
    objectId: 'folder',
    partners: ['puzzle', 'pen', 'coin'],
    face: { x: 0.18, y: 0.14, w: 0.64, h: 0.5 },
    footprint: FULL,
    anchor: 'support',
  },
  wallet: {
    objectId: 'wallet',
    partners: ['coin'],
    face: { x: 0.16, y: 0.1, w: 0.68, h: 0.62 },
    footprint: FULL,
    anchor: 'support',
  },
  phone: {
    objectId: 'phone',
    partners: [],
    face: NO_FACE,
    footprint: FULL,
    anchor: 'top',
  },
  puzzle: {
    objectId: 'puzzle',
    partners: [],
    face: NO_FACE,
    footprint: FULL,
    anchor: 'top',
  },
  pen: {
    objectId: 'pen',
    partners: [],
    face: NO_FACE,
    footprint: FULL,
    anchor: 'top',
  },
  coin: {
    objectId: 'coin',
    partners: [],
    face: NO_FACE,
    footprint: FULL,
    anchor: 'top',
  },
  headphones: {
    objectId: 'headphones',
    partners: [],
    face: NO_FACE,
    footprint: FULL,
    anchor: 'side',
  },
  lamp: {
    objectId: 'lamp',
    partners: [],
    face: NO_FACE,
    footprint: FULL,
    anchor: 'side',
  },
  flowers: {
    objectId: 'flowers',
    partners: [],
    face: NO_FACE,
    footprint: FULL,
    anchor: 'side',
  },
};

export function profile(objectId: string): PlacementProfile {
  const found = PLACEMENT[objectId];
  if (!found) throw new Error(`No placement profile for ${objectId}`);
  return found;
}

export function canRest(riderId: string, supportId: string): boolean {
  return profile(supportId).partners.includes(riderId);
}

export function faceOf(objectId: string, box: Box): Box {
  const face = profile(objectId).face;
  return {
    x: box.x + box.w * face.x,
    y: box.y + box.h * face.y,
    w: box.w * face.w,
    h: box.h * face.h,
  };
}

export function footprintOf(objectId: string, box: Box): Box {
  const foot = profile(objectId).footprint;
  return {
    x: box.x + box.w * foot.x,
    y: box.y + box.h * foot.y,
    w: box.w * foot.w,
    h: box.h * foot.h,
  };
}
