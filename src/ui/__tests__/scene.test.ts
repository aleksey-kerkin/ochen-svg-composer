import { describe, expect, it } from 'vitest';
import { applyInverse, type SvgMatrix } from '../svgPoint.ts';
import { objectTransform } from '../transforms.ts';

describe('objectTransform', () => {
  it('centers the asset, then scales, rotates, and moves it', () => {
    expect(
      objectTransform({ x: 10, y: 20, rotation: 15 }, 0.4, { w: 100, h: 40 }),
    ).toBe('translate(10 20) rotate(15) scale(0.4) translate(-50 -20)');
  });

  it('uses one scale value in the transform', () => {
    const transform = objectTransform({ x: 1, y: 2, rotation: 0 }, 0.35, {
      w: 10,
      h: 8,
    });
    expect(transform.match(/scale\([^)]+\)/g)).toEqual(['scale(0.35)']);
  });
});

describe('applyInverse', () => {
  const identity: SvgMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  it('maps a client point through the inverse of the screen CTM', () => {
    expect(applyInverse(identity, 10, 20)).toEqual({ x: 10, y: 20 });
    expect(applyInverse({ ...identity, e: 100, f: 40 }, 110, 50)).toEqual({
      x: 10,
      y: 10,
    });
    expect(applyInverse({ ...identity, a: 2, d: 2 }, 20, 40)).toEqual({
      x: 10,
      y: 20,
    });
  });

  it('rejects a CTM that cannot be inverted', () => {
    expect(() => applyInverse({ ...identity, a: 0, d: 0 }, 1, 1)).toThrow(
      /invert/i,
    );
  });
});
