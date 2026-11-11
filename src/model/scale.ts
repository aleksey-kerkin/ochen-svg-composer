import manifestJson from '../library/manifest.json' with { type: 'json' };
import { FORMATS } from './formats.ts';
import type { FormatId, Manifest, Size } from './types.ts';

const manifest = manifestJson as Manifest;

/**
 * Scene scale for L assets on the 1200×630 frame.
 * The spec's SVG-drop guide puts the book near 530px, which is 0.37 here.
 */
const LANDSCAPE_L_SCALE = 0.37;

export function shortSide(format: FormatId): number {
  const frame = FORMATS[format];
  return Math.min(frame.w, frame.h);
}

/**
 * Default L scale. Square and portrait follow the frame's short side.
 * Portrait is 1080×1620, so the short side stays 1080 and the extra height
 * does not enlarge objects.
 */
export function defaultScale(format: FormatId): number {
  return LANDSCAPE_L_SCALE * (shortSide(format) / shortSide('landscape'));
}

function averageSizeRatio(): number {
  const ratios: number[] = [];
  for (const item of manifest.items) {
    for (const role of ['main', 'background'] as const) {
      const large = item.assets.find(
        (asset) => asset.size === 'L' && asset.role === role,
      );
      const small = item.assets.find(
        (asset) => asset.size === 'S' && asset.role === role,
      );
      if (!large || !small) {
        throw new Error(`Missing L/S pair for ${item.objectId} ${role}`);
      }
      ratios.push(
        (large.svgSize.w / small.svgSize.w +
          large.svgSize.h / small.svgSize.h) /
          2,
      );
    }
  }
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

/** S assets are about half of L, so the scene scale is multiplied by this. */
const S_FACTOR = averageSizeRatio();

export function sizeFactor(size: Size): number {
  return size === 'L' ? 1 : S_FACTOR;
}

/** `composition.scale` is stored in L units. S multiplies it by one coefficient. */
export function renderScale(scale: number, size: Size): number {
  return scale * sizeFactor(size);
}
