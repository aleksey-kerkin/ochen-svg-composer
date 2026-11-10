import { describe, expect, it } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import { FORMATS } from '../../model/formats.ts';
import { defaultScale } from '../../model/scale.ts';
import type {
  FormatId,
  LayoutTemplate,
  Manifest,
  PlacedObject,
  Slot2D,
} from '../../model/types.ts';
import { layout, templateById } from '../layout.ts';

const library = manifest as Manifest;
const TEMPLATE_IDS = ['under-title', 'offset', 'compact'] as const;
const FORMATS_IDS = ['landscape', 'square', 'portrait'] as const;

function placed(over: Partial<PlacedObject> = {}): PlacedObject {
  return {
    uid: 'obj-1',
    objectId: 'book',
    role: 'main',
    x: 10,
    y: 20,
    rotation: 33,
    z: 1,
    ...over,
  };
}

function nearSlot(object: PlacedObject, slot: Slot2D, format: FormatId) {
  const frame = FORMATS[format];
  return (
    Math.abs(object.x / frame.w - slot.x) < 0.04 &&
    Math.abs(object.y / frame.h - slot.y) < 0.04
  );
}

function inSafeArea(object: PlacedObject, template: LayoutTemplate) {
  const frame = FORMATS[template.format];
  const safe = template.safeArea;
  if (!safe) return false;
  const x = object.x / frame.w;
  const y = object.y / frame.h;
  return (
    x >= safe.x && x <= safe.x + safe.w && y >= safe.y && y <= safe.y + safe.h
  );
}

describe('layout', () => {
  it('repeats the same seed and moves when the seed changes', () => {
    const objects = [
      placed(),
      placed({ uid: 'obj-2', objectId: 'phone', z: 2 }),
    ];
    const template = templateById('offset', 'landscape');
    const once = layout(objects, template, 1);
    expect(layout(objects, template, 1)).toEqual(once);
    expect(
      layout(objects, template, 2).map((object) => [object.x, object.y]),
    ).not.toEqual(once.map((object) => [object.x, object.y]));
  });

  it('uses the slot angle and does not give an object its own scale', () => {
    const template = templateById('compact', 'square');
    const [object] = layout([placed({ rotation: 33 })], template, 3);
    const slot = template.mainSlots[0];
    expect(object).toBeDefined();
    expect(slot?.rotation).not.toBe(0);
    expect(object?.rotation).toBe(slot?.rotation ?? 0);
    expect(object).not.toHaveProperty('scale');
    expect(object?.uid).toBe('obj-1');
    expect(object?.objectId).toBe('book');
  });

  it('stacks backgrounds behind mains and keeps the front main on top', () => {
    const objects = [
      placed({ z: 4, colorShift: 1 }),
      placed({
        uid: 'obj-2',
        objectId: 'pen',
        role: 'background',
        z: 9,
      }),
      placed({ uid: 'obj-3', objectId: 'phone', z: 1 }),
    ];
    const result = layout(objects, templateById('compact', 'landscape'), 1);
    const mains = result.filter((object) => object.role === 'main');
    const backgrounds = result.filter((object) => object.role === 'background');
    expect(backgrounds.length).toBeGreaterThan(0);
    expect(Math.max(...backgrounds.map((object) => object.z))).toBeLessThan(
      Math.min(...mains.map((object) => object.z)),
    );
    const top = result.reduce((best, object) =>
      object.z > best.z ? object : best,
    );
    expect(top.objectId).toBe('book');
    expect(result.find((object) => object.uid === 'obj-1')?.colorShift).toBe(1);
  });

  it('drops objects that have no matching slot', () => {
    const objects = ['book', 'phone', 'puzzle'].map((objectId, index) =>
      placed({ uid: `obj-${index + 1}`, objectId, z: index }),
    );
    const result = layout(objects, templateById('offset', 'square'), 4);
    expect(result.map((object) => object.objectId).sort()).toEqual([
      'phone',
      'puzzle',
    ]);
  });

  it('keeps under-title mains out of the title area in every format', () => {
    for (const format of FORMATS_IDS) {
      const template = templateById('under-title', format);
      const result = layout(
        [placed(), placed({ uid: 'obj-2', objectId: 'phone', z: 0 })],
        template,
        7,
      );
      expect(template.safeArea).toBeDefined();
      for (const object of result.filter((entry) => entry.role === 'main')) {
        expect(inSafeArea(object, template)).toBe(false);
      }
    }
  });

  it('places an offset object outside the frame', () => {
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      const result = layout(
        [placed({ z: 3 }), placed({ uid: 'obj-2', objectId: 'puzzle', z: 1 })],
        templateById('offset', format),
        1,
      );
      expect(
        result.some(
          (object) =>
            object.x < 0 ||
            object.y < 0 ||
            object.x > frame.w ||
            object.y > frame.h,
        ),
      ).toBe(true);
    }
  });

  it('puts a background object on a background slot', () => {
    const format = 'landscape' as const;
    const template = templateById('compact', format);
    const [object] = layout(
      [placed({ role: 'background', rotation: 90 })],
      template,
      1,
    );
    expect(object).toBeDefined();
    expect(
      template.backgroundSlots.some((slot) => nearSlot(object!, slot, format)),
    ).toBe(true);
    expect(
      template.mainSlots.some((slot) => nearSlot(object!, slot, format)),
    ).toBe(false);
  });

  it('can place every library object into a main slot', () => {
    const template = templateById('compact', 'landscape');
    for (const item of library.items) {
      expect(
        layout([placed({ objectId: item.objectId })], template, 1).map(
          (object) => object.objectId,
        ),
      ).toEqual([item.objectId]);
    }
  });

  it('shares one scale across the templates of a format', () => {
    for (const format of FORMATS_IDS) {
      for (const id of TEMPLATE_IDS) {
        const template = templateById(id, format);
        expect(template.format).toBe(format);
        expect(template.scale).toBeCloseTo(defaultScale(format));
        expect(template.mainSlots.length).toBeGreaterThan(0);
      }
    }
  });
});
