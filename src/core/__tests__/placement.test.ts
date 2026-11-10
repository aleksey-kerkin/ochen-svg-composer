import { describe, expect, it } from 'vitest';
import { FORMATS } from '../../model/formats.ts';
import type { FormatId, PlacedObject } from '../../model/types.ts';
import { composePlacements } from '../compose.ts';
import {
  RIDERS,
  SUPPORTS,
  axisBox,
  contains,
  crossesFrame,
  intersection,
  topFace,
} from '../geometry.ts';
import { layout, templateById } from '../layout.ts';

const FORMATS_IDS: FormatId[] = ['landscape', 'square', 'portrait'];

function placed(over: Partial<PlacedObject> = {}): PlacedObject {
  return {
    uid: 'obj-1',
    objectId: 'book',
    role: 'main',
    x: 0,
    y: 0,
    rotation: 0,
    z: 1,
    ...over,
  };
}

function stacked(rider: PlacedObject, support: PlacedObject, scale: number) {
  return contains(topFace(axisBox(support, scale)), axisBox(rider, scale));
}

function expectMains(objects: PlacedObject[], scale: number) {
  const mains = objects.filter((object) => object.role === 'main');
  for (let left = 0; left < mains.length; left += 1) {
    for (let right = left + 1; right < mains.length; right += 1) {
      const a = mains[left];
      const b = mains[right];
      if (!a || !b) continue;
      const hit = intersection(axisBox(a, scale), axisBox(b, scale));
      const rider = RIDERS.has(a.objectId)
        ? a
        : RIDERS.has(b.objectId)
          ? b
          : undefined;
      const support = SUPPORTS.has(a.objectId)
        ? a
        : SUPPORTS.has(b.objectId)
          ? b
          : undefined;
      if (
        hit &&
        rider &&
        support &&
        rider !== support &&
        stacked(rider, support, scale)
      ) {
        expect(rider.z).toBeGreaterThan(support.z);
        continue;
      }
      expect(hit).toBeNull();
      if (Math.abs(a.y - b.y) > 1) {
        const lower = a.y > b.y ? a : b;
        const upper = lower === a ? b : a;
        expect(lower.z).toBeGreaterThan(upper.z);
      }
    }
  }
}

describe('placement geometry', () => {
  it('puts the phone fully on the book, above it, in every format', () => {
    for (const format of FORMATS_IDS) {
      for (const seed of [1, 2, 7]) {
        const template = templateById('compact', format);
        const result = layout(
          [placed({ z: 2 }), placed({ uid: 'obj-2', objectId: 'phone', z: 1 })],
          template,
          seed,
        );
        const book = result.find((object) => object.objectId === 'book');
        const phone = result.find((object) => object.objectId === 'phone');
        if (!book || !phone) throw new Error(format);
        expect(stacked(phone, book, template.scale)).toBe(true);
        expect(phone.z).toBeGreaterThan(book.z);
        expectMains(result, template.scale);
      }
    }
  });

  it('keeps a puzzle off the book when the phone already fills the top face', () => {
    for (const format of FORMATS_IDS) {
      const template = templateById('compact', format);
      const result = layout(
        [
          placed({ z: 3 }),
          placed({ uid: 'obj-2', objectId: 'phone', z: 2 }),
          placed({ uid: 'obj-3', objectId: 'puzzle', z: 1 }),
        ],
        template,
        3,
      );
      const book = result.find((object) => object.objectId === 'book');
      const phone = result.find((object) => object.objectId === 'phone');
      const puzzle = result.find((object) => object.objectId === 'puzzle');
      if (!book || !phone || !puzzle) throw new Error('missing');
      expect(stacked(phone, book, template.scale)).toBe(true);
      expect(phone.z).toBeGreaterThan(book.z);
      const puzzleOnBook = stacked(puzzle, book, template.scale);
      if (!puzzleOnBook) {
        expect(
          intersection(
            axisBox(puzzle, template.scale),
            axisBox(book, template.scale),
          ),
        ).toBeNull();
      }
      expect(
        intersection(
          axisBox(puzzle, template.scale),
          axisBox(phone, template.scale),
        ),
      ).toBeNull();
      expectMains(result, template.scale);
    }
  });

  it('puts headphones beside the vase, with the lower object in front', () => {
    for (const format of FORMATS_IDS) {
      const template = templateById('offset', format);
      const result = layout(
        [
          placed({ objectId: 'headphones', z: 2 }),
          placed({ uid: 'obj-2', objectId: 'flowers', z: 1 }),
        ],
        template,
        4,
      );
      expectMains(result, template.scale);
      const headphones = result.find(
        (object) => object.objectId === 'headphones',
      );
      const vase = result.find((object) => object.objectId === 'flowers');
      if (!headphones || !vase) throw new Error(format);
      expect(
        intersection(
          axisBox(headphones, template.scale),
          axisBox(vase, template.scale),
        ),
      ).toBeNull();
      const lower = headphones.y > vase.y ? headphones : vase;
      const upper = lower === headphones ? vase : headphones;
      expect(lower.z).toBeGreaterThan(upper.z);
    }
  });

  it('adds cropped monochrome backgrounds behind named mains', () => {
    const placed = composePlacements(
      [
        { objectId: 'book', count: 1 },
        { objectId: 'phone', count: 1 },
        { objectId: 'puzzle', count: 1 },
      ],
      { format: 'square', seed: 1 },
    );
    const named = new Set(['book', 'phone', 'puzzle']);
    const mains = placed.objects.filter((object) => object.role === 'main');
    const backgrounds = placed.objects.filter(
      (object) => object.role === 'background',
    );
    expect(mains.map((object) => object.objectId).sort()).toEqual([
      'book',
      'phone',
      'puzzle',
    ]);
    expect(backgrounds.length).toBeGreaterThanOrEqual(1);
    expect(backgrounds.length).toBeLessThanOrEqual(2);
    const frame = FORMATS.square;
    for (const object of backgrounds) {
      expect(named.has(object.objectId)).toBe(false);
      expect(object.z).toBeLessThan(Math.min(...mains.map((entry) => entry.z)));
      expect(crossesFrame(axisBox(object, placed.scale), frame)).toBe(true);
    }
    expectMains(placed.objects, placed.scale);
  });

  it('can compose without background objects', () => {
    const placed = composePlacements(
      [
        { objectId: 'headphones', count: 1 },
        { objectId: 'flowers', count: 1 },
      ],
      { format: 'portrait', seed: 2, withBackgrounds: false },
    );
    expect(placed.objects.map((object) => object.objectId).sort()).toEqual([
      'flowers',
      'headphones',
    ]);
    expect(placed.objects.every((object) => object.role === 'main')).toBe(true);
  });

  it('keeps six coins as mains with boxes that do not overlap', () => {
    const placed = composePlacements([{ objectId: 'coin', count: 6 }], {
      format: 'landscape',
      templateId: 'compact',
      seed: 3,
      withBackgrounds: false,
    });
    expect(placed.objects).toHaveLength(6);
    expect(new Set(placed.objects.map((object) => object.uid)).size).toBe(6);
    expect(placed.objects.every((object) => object.role === 'main')).toBe(true);
    expectMains(placed.objects, placed.scale);
  });
});
