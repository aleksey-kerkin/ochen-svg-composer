import { describe, expect, it } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import { FORMATS } from '../formats.ts';
import { defaultScale, renderScale, sizeFactor } from '../scale.ts';
import type { FormatId, Manifest, Role, Size } from '../types.ts';

const library = manifest as Manifest;

function svgSize(objectId: string, size: Size, role: Role) {
  const item = library.items.find((entry) => entry.objectId === objectId);
  const asset = item?.assets.find(
    (entry) => entry.size === size && entry.role === role,
  );
  if (!asset) throw new Error(`missing ${objectId} ${size} ${role}`);
  return asset.svgSize;
}

function meanSizeRatio(): number {
  const ratios: number[] = [];
  for (const item of library.items) {
    for (const role of ['main', 'background'] as const) {
      const large = svgSize(item.objectId, 'L', role);
      const small = svgSize(item.objectId, 'S', role);
      ratios.push((large.w / small.w + large.h / small.h) / 2);
    }
  }
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

function shortSide(format: FormatId): number {
  const frame = FORMATS[format];
  return Math.min(frame.w, frame.h);
}

describe('defaultScale', () => {
  it('places an L book inside the 1200×630 frame', () => {
    const scale = defaultScale('landscape');
    expect(scale).toBeGreaterThanOrEqual(0.26);
    expect(scale).toBeLessThanOrEqual(0.4);
    const width = svgSize('book', 'L', 'main').w * scale;
    expect(width).toBeGreaterThan(480);
    expect(width).toBeLessThan(600);
  });

  it('follows the short side on square and portrait', () => {
    const landscape = defaultScale('landscape');
    for (const format of ['square', 'portrait'] as const) {
      expect(defaultScale(format)).toBeCloseTo(
        landscape * (shortSide(format) / shortSide('landscape')),
      );
    }
  });
});

describe('renderScale', () => {
  it('stores L as the unit and applies one S coefficient', () => {
    expect(sizeFactor('L')).toBe(1);
    expect(sizeFactor('S')).toBeCloseTo(meanSizeRatio());
    expect(renderScale(0.36, 'L')).toBeCloseTo(0.36);
    expect(renderScale(0.36, 'S')).toBeCloseTo(0.36 * sizeFactor('S'));
  });

  it('keeps the visible box about the same at S and at L', () => {
    const scale = defaultScale('landscape');
    for (const item of library.items) {
      for (const role of ['main', 'background'] as const) {
        const large = svgSize(item.objectId, 'L', role);
        const small = svgSize(item.objectId, 'S', role);
        const largeWidth = large.w * renderScale(scale, 'L');
        const smallWidth = small.w * renderScale(scale, 'S');
        const largeHeight = large.h * renderScale(scale, 'L');
        const smallHeight = small.h * renderScale(scale, 'S');
        expect(Math.abs(smallWidth - largeWidth) / largeWidth).toBeLessThan(
          0.1,
        );
        expect(Math.abs(smallHeight - largeHeight) / largeHeight).toBeLessThan(
          0.1,
        );
      }
    }
  });
});
