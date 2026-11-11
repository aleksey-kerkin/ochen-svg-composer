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
import { mainGroupFill } from '../arrange.ts';
import {
  type Box,
  axisBox,
  intersection,
  visibleFraction,
} from '../geometry.ts';
import { layout, layoutScene, templateById } from '../layout.ts';

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
    const book = result.find((object) => object.objectId === 'book');
    const phone = result.find((object) => object.objectId === 'phone');
    expect(phone).toBeDefined();
    expect(book).toBeDefined();
    expect(phone!.z).toBeGreaterThan(book!.z);
    expect(result.find((object) => object.uid === 'obj-1')?.colorShift).toBe(1);
  });

  it('keeps every main object when there are more mains than slots', () => {
    const objects = ['book', 'phone', 'puzzle'].map((objectId, index) =>
      placed({ uid: `obj-${index + 1}`, objectId, z: index }),
    );
    const result = layout(objects, templateById('offset', 'square'), 4);
    expect(result.map((object) => object.objectId).sort()).toEqual([
      'book',
      'phone',
      'puzzle',
    ]);
  });

  it('keeps under-title mains out of the title area in every format', () => {
    for (const format of FORMATS_IDS) {
      const template = templateById('under-title', format);
      const scene = layoutScene(
        [placed(), placed({ uid: 'obj-2', objectId: 'phone', z: 0 })],
        template,
        7,
      );
      expect(template.safeArea).toBeDefined();
      for (const object of scene.objects.filter(
        (entry) => entry.role === 'main',
      )) {
        expect(inSafeArea(object, template)).toBe(false);
      }
    }
  });

  it('crops an offset background and keeps the mains inside the frame', () => {
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      const template = templateById('offset', format);
      const scene = layoutScene(
        [
          placed({ z: 3 }),
          placed({ uid: 'obj-2', objectId: 'puzzle', z: 1 }),
          placed({
            uid: 'obj-3',
            objectId: 'lamp',
            role: 'background',
            z: 0,
          }),
        ],
        template,
        1,
      );
      const mains = scene.objects.filter((object) => object.role === 'main');
      const backgrounds = scene.objects.filter(
        (object) => object.role === 'background',
      );
      expect(backgrounds.length).toBeGreaterThan(0);
      for (const object of mains) {
        expect(
          visibleFraction(axisBox(object, scene.scale), frame),
        ).toBeGreaterThanOrEqual(0.7);
      }
      for (const object of backgrounds) {
        const item = library.items.find(
          (entry) => entry.objectId === object.objectId,
        );
        const asset = item?.assets.find(
          (entry) => entry.size === 'L' && entry.role === 'background',
        );
        if (!asset) throw new Error(object.objectId);
        const halfW = (asset.svgSize.w * scene.scale) / 2;
        const halfH = (asset.svgSize.h * scene.scale) / 2;
        const visible = visibleFraction(
          {
            x: object.x - halfW,
            y: object.y - halfH,
            w: halfW * 2,
            h: halfH * 2,
          },
          frame,
        );
        expect(visible).toBeGreaterThanOrEqual(0.5);
      }
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

  it('shares one large scale across the templates of a format', () => {
    const book = library.items.find((item) => item.objectId === 'book');
    const asset = book?.assets.find(
      (entry) => entry.size === 'L' && entry.role === 'main',
    );
    if (!asset) throw new Error('missing book');
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      const scales = TEMPLATE_IDS.map((id) => templateById(id, format).scale);
      expect(new Set(scales.map((scale) => scale.toFixed(5))).size).toBe(1);
      const scale = scales[0] ?? 0;
      const cover = Math.max(
        (asset.svgSize.w * scale) / frame.w,
        (asset.svgSize.h * scale) / frame.h,
      );
      expect(cover).toBeGreaterThan(0.9);
      expect(scale).toBeGreaterThan(defaultScale(format) * 1.1);
      expect(templateById('compact', format).mainSlots.length).toBeGreaterThan(
        1,
      );
    }
  });

  it('scales the main group to 80-90% at S and 90-110% at L', () => {
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      for (const templateId of TEMPLATE_IDS) {
        const template = templateById(templateId, format);
        for (const size of ['S', 'L'] as const) {
          const scene = layoutScene(
            [
              placed({ uid: 'book', objectId: 'book' }),
              placed({ uid: 'pen', objectId: 'pen' }),
            ],
            template,
            2,
            size,
          );
          const mains = scene.objects.filter(
            (object) => object.role === 'main',
          );
          const fill = mainGroupFill(mains, scene.scale, frame);
          const [low, high] = size === 'S' ? [0.8, 0.9] : [0.9, 1.1];
          expect(fill).toBeGreaterThanOrEqual(low - 0.02);
          expect(fill).toBeLessThanOrEqual(high + 0.02);
        }
      }
    }
  });

  it('keeps backgrounds beside the group and scales the whole scene', () => {
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      const limit = Math.min(frame.w, frame.h);
      for (const templateId of TEMPLATE_IDS) {
        const template = templateById(templateId, format);
        for (const size of ['S', 'L'] as const) {
          const scene = layoutScene(
            [
              placed({ uid: 'book', objectId: 'book' }),
              placed({ uid: 'pen', objectId: 'pen' }),
              placed({
                uid: 'lamp',
                objectId: 'lamp',
                role: 'background',
              }),
              placed({
                uid: 'flowers',
                objectId: 'flowers',
                role: 'background',
              }),
            ],
            template,
            1,
            size,
          );
          const mains = scene.objects.filter(
            (object) => object.role === 'main',
          );
          const mainUnion = unionOf(
            mains.map((object) => axisBox(object, scene.scale)),
          );
          const fill = mainGroupFill(scene.objects, scene.scale, frame);
          const [low, high] = size === 'S' ? [0.8, 0.9] : [0.9, 1.1];
          expect(fill).toBeGreaterThanOrEqual(low - 0.02);
          expect(fill).toBeLessThanOrEqual(high + 0.02);
          const hero = mains.reduce((best, object) =>
            axisBox(object, scene.scale).w * axisBox(object, scene.scale).h >
            axisBox(best, scene.scale).w * axisBox(best, scene.scale).h
              ? object
              : best,
          );
          expect(
            visibleFraction(axisBox(hero, scene.scale), frame),
          ).toBeGreaterThanOrEqual(0.7);
          const centers: number[] = [];
          for (const background of scene.objects) {
            if (background.role !== 'background') continue;
            const box = axisBox(background, scene.scale);
            expect(visibleFraction(box, frame)).toBeGreaterThanOrEqual(0.5);
            expect(separation(box, mainUnion)).toBeLessThan(limit * 0.22);
            centers.push(box.y + box.h / 2);
            for (const main of mains) {
              expect(intersection(box, axisBox(main, scene.scale))).toBeNull();
            }
            expect(background.z).toBeLessThan(
              Math.min(...mains.map((object) => object.z)),
            );
          }
          const highCenter = Math.max(...centers);
          const lowCenter = Math.min(...centers);
          expect(highCenter - lowCenter).toBeGreaterThan(frame.h * 0.12);
        }
      }
    }
  });
});

function unionOf(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function separation(box: Box, other: Box): number {
  const dx = Math.max(
    other.x - (box.x + box.w),
    box.x - (other.x + other.w),
    0,
  );
  const dy = Math.max(
    other.y - (box.y + box.h),
    box.y - (other.y + other.h),
    0,
  );
  return Math.hypot(dx, dy);
}
