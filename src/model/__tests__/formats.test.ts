import { describe, expect, it } from 'vitest';
import { FORMATS, coverPlacement } from '../formats.ts';

function expectCover(frameW: number, frameH: number, side: number) {
  const placed = coverPlacement(frameW, frameH, side);
  const drawn = side * placed.scale;
  expect(drawn).toBeGreaterThanOrEqual(frameW);
  expect(drawn).toBeGreaterThanOrEqual(frameH);
  expect(placed.x + drawn / 2).toBeCloseTo(frameW / 2);
  expect(placed.y + drawn / 2).toBeCloseTo(frameH / 2);
}

describe('FORMATS', () => {
  it('keeps landscape and square and uses a 2:3 portrait', () => {
    expect(FORMATS.landscape).toEqual({ w: 1200, h: 630 });
    expect(FORMATS.square).toEqual({ w: 1080, h: 1080 });
    expect(FORMATS.portrait).toEqual({ w: 1080, h: 1620 });
    expect(FORMATS.portrait.h / FORMATS.portrait.w).toBeCloseTo(3 / 2);
  });
});

describe('coverPlacement', () => {
  it('covers a landscape frame and keeps the background centered', () => {
    const frame = FORMATS.landscape;
    expectCover(frame.w, frame.h, 1000);
    expectCover(frame.w, frame.h, 500);
  });

  it('covers a portrait frame and keeps the background centered', () => {
    const frame = FORMATS.portrait;
    expectCover(frame.w, frame.h, 1000);
    expectCover(frame.w, frame.h, 500);
  });

  it('covers a square frame exactly when the side matches the frame', () => {
    const placed = coverPlacement(1080, 1080, 1080);
    expect(placed).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
