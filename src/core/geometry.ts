import manifestJson from '../library/manifest.json' with { type: 'json' };
import type { Manifest, PlacedObject, Role } from '../model/types.ts';
import { PLACEMENT } from './profiles.ts';

const library = manifestJson as Manifest;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Book's open pages. Kept for the phone-on-book checks. Other supports use
 * their own face in `profiles.ts`.
 */
export const TOP_FACE = PLACEMENT.book?.face ?? {
  x: 0.14,
  y: 0.08,
  w: 0.72,
  h: 0.52,
};

export const SUPPORTS = new Set(
  Object.values(PLACEMENT)
    .filter((entry) => entry.partners.length > 0)
    .map((entry) => entry.objectId),
);

export const RIDERS = new Set(
  Object.values(PLACEMENT).flatMap((entry) => [...entry.partners]),
);

export function assetSize(
  objectId: string,
  role: Role,
): { w: number; h: number } {
  const item = library.items.find((entry) => entry.objectId === objectId);
  const asset = item?.assets.find(
    (entry) => entry.size === 'L' && entry.role === role,
  );
  if (!asset) throw new Error(`Missing L ${role} asset for ${objectId}`);
  return asset.svgSize;
}

/** How far the top-face center sits above the object's center, in pixels. */
export function faceLift(height: number): number {
  const faceMid = TOP_FACE.y + TOP_FACE.h / 2;
  return (0.5 - faceMid) * height;
}

export function renderedSize(
  object: PlacedObject,
  scale: number,
): { w: number; h: number } {
  const size = assetSize(object.objectId, object.role);
  return { w: size.w * scale, h: size.h * scale };
}

/** Axis-aligned box after rotation. Scale is the L-unit composition scale. */
export function axisBox(object: PlacedObject, scale: number): Box {
  const size = assetSize(object.objectId, object.role);
  const rad = (object.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (size.w * scale) / 2;
  const halfH = (size.h * scale) / 2;
  const bw = halfW * cos + halfH * sin;
  const bh = halfW * sin + halfH * cos;
  return { x: object.x - bw, y: object.y - bh, w: bw * 2, h: bh * 2 };
}

export function topFace(box: Box): Box {
  return {
    x: box.x + box.w * TOP_FACE.x,
    y: box.y + box.h * TOP_FACE.y,
    w: box.w * TOP_FACE.w,
    h: box.h * TOP_FACE.h,
  };
}

export function intersection(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right - x <= 0.5 || bottom - y <= 0.5) return null;
  return { x, y, w: right - x, h: bottom - y };
}

export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.w <= outer.x + outer.w + 0.5 &&
    inner.y + inner.h <= outer.y + outer.h + 0.5
  );
}

export function crossesFrame(
  box: Box,
  frame: { w: number; h: number },
): boolean {
  return (
    box.x < -0.5 ||
    box.y < -0.5 ||
    box.x + box.w > frame.w + 0.5 ||
    box.y + box.h > frame.h + 0.5
  );
}
