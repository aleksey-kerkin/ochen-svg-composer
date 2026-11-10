import type { FormatId } from './types.ts';

/** Frame sizes in pixels. Square and portrait are assumption [A] from the spec. */
export const FORMATS: Record<FormatId, { w: number; h: number }> = {
  landscape: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
};

export interface CoverPlacement {
  scale: number;
  x: number;
  y: number;
}

/** Square background placed as CSS cover: scale = max(frame) / side, centered. */
export function coverPlacement(
  frameW: number,
  frameH: number,
  side: number,
): CoverPlacement {
  const scale = Math.max(frameW, frameH) / side;
  const drawn = side * scale;
  return {
    scale,
    x: (frameW - drawn) / 2,
    y: (frameH - drawn) / 2,
  };
}

export function coverTransform(placement: CoverPlacement): string {
  return `translate(${placement.x} ${placement.y}) scale(${placement.scale})`;
}
