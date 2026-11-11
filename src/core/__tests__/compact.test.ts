import { describe, expect, it } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import { FORMATS } from '../../model/formats.ts';
import type { FormatId, Manifest, PlacedObject } from '../../model/types.ts';
import { ensureBackdrop } from '../backdrop.ts';
import { composePick, composePlacements } from '../compose.ts';
import {
  type Box,
  axisBox,
  contains,
  intersection,
  visibleFraction,
} from '../geometry.ts';
import { layoutScene, templateById } from '../layout.ts';
import { canRest, faceOf } from '../profiles.ts';

const library = manifest as Manifest;
const IDS = library.items.map((item) => item.objectId);
const FORMATS_IDS: FormatId[] = ['landscape', 'square', 'portrait'];

function objects(ids: string[], format: FormatId): PlacedObject[] {
  const mains: PlacedObject[] = ids.map((objectId, index) => ({
    uid: `obj-${index + 1}`,
    objectId,
    role: 'main',
    x: 0,
    y: 0,
    rotation: 0,
    z: index,
  }));
  return ensureBackdrop(mains, format);
}

function nearestGap(boxes: Box[]): number {
  if (boxes.length < 2) return 0;
  let worst = 0;
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (!box) continue;
    let best = Number.POSITIVE_INFINITY;
    for (let other = 0; other < boxes.length; other += 1) {
      if (other === index) continue;
      const next = boxes[other];
      if (!next) continue;
      const dx = Math.max(
        0,
        Math.max(box.x, next.x) - Math.min(box.x + box.w, next.x + next.w),
      );
      const dy = Math.max(
        0,
        Math.max(box.y, next.y) - Math.min(box.y + box.h, next.y + next.h),
      );
      const gap = dx === 0 || dy === 0 ? Math.max(dx, dy) : Math.hypot(dx, dy);
      best = Math.min(best, gap);
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

function forbidden(objectsInScene: PlacedObject[], scale: number): string[] {
  const notes: string[] = [];
  const mains = objectsInScene.filter((object) => object.role === 'main');
  for (let left = 0; left < mains.length; left += 1) {
    for (let right = left + 1; right < mains.length; right += 1) {
      const a = mains[left];
      const b = mains[right];
      if (!a || !b) continue;
      const hit = intersection(axisBox(a, scale), axisBox(b, scale));
      if (!hit) continue;
      const rider = canRest(a.objectId, b.objectId)
        ? a
        : canRest(b.objectId, a.objectId)
          ? b
          : undefined;
      const support = rider === a ? b : rider === b ? a : undefined;
      if (
        !rider ||
        !support ||
        !contains(
          faceOf(support.objectId, axisBox(support, scale)),
          axisBox(rider, scale),
        )
      ) {
        notes.push(`${a.objectId} cuts ${b.objectId}`);
      }
    }
  }
  for (const background of objectsInScene) {
    if (background.role !== 'background') continue;
    for (const main of mains) {
      if (intersection(axisBox(background, scale), axisBox(main, scale))) {
        notes.push(`${background.objectId} covers ${main.objectId}`);
      }
    }
  }
  return notes;
}

function randomGroups(seed: number, count: number): string[][] {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const groups: string[][] = [];
  for (let index = 0; index < count; index += 1) {
    const size = index % 3 === 0 ? 3 : 2;
    const pool = [...IDS];
    const picked: string[] = [];
    while (picked.length < size && pool.length > 0) {
      const at = Math.floor(next() * pool.length);
      const id = pool.splice(at, 1)[0];
      if (id) picked.push(id);
    }
    groups.push(picked);
  }
  return groups;
}

describe('compact layout', () => {
  it('keeps most of every background inside the frame in all formats', () => {
    const scenes = [
      ['book', 'phone', 'puzzle'],
      ['headphones', 'flowers'],
      ['wallet', 'coin'],
      ['lamp', 'folder'],
    ];
    const failures: string[] = [];
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      const template = templateById('compact', format);
      for (const ids of scenes) {
        const scene = layoutScene(objects(ids, format), template, 3);
        for (const background of scene.objects) {
          if (background.role !== 'background') continue;
          const visible = visibleFraction(
            axisBox(background, scene.scale),
            frame,
          );
          if (visible < 0.38 || visible > 0.62) {
            failures.push(
              `${format} ${ids.join('+')} ${background.objectId} ${visible.toFixed(2)}`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('packs mains into a tight group and fills the frame with the whole scene', () => {
    const scenes = [
      ['book', 'phone'],
      ['book', 'phone', 'puzzle'],
      ['headphones', 'flowers'],
      ['folder', 'pen', 'coin'],
      ['wallet', 'coin'],
    ];
    const failures: string[] = [];
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      for (const templateId of ['compact', 'offset'] as const) {
        const template = templateById(templateId, format);
        for (const ids of scenes) {
          const scene = layoutScene(objects(ids, format), template, 4);
          const mains = scene.objects.filter(
            (object) => object.role === 'main',
          );
          const boxes = mains.map((object) => axisBox(object, scene.scale));
          const gap = nearestGap(boxes);
          const limit = Math.max(24, frame.w * 0.06);
          if (gap > limit) {
            failures.push(
              `${format} ${templateId} ${ids.join('+')} gap ${gap.toFixed(0)}`,
            );
          }
          const all = scene.objects.map((object) =>
            axisBox(object, scene.scale),
          );
          const left = Math.min(...all.map((box) => box.x));
          const top = Math.min(...all.map((box) => box.y));
          const right = Math.max(...all.map((box) => box.x + box.w));
          const bottom = Math.max(...all.map((box) => box.y + box.h));
          const span = Math.max(
            (right - left) / frame.w,
            (bottom - top) / frame.h,
          );
          if (span < 0.72) {
            failures.push(
              `${format} ${templateId} ${ids.join('+')} span ${span.toFixed(2)}`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('avoids forbidden overlaps across random groups, seeds, and formats', () => {
    const seeds = [1, 2, 5, 9, 17, 28, 41];
    const failures: string[] = [];
    for (const seed of seeds) {
      for (const format of FORMATS_IDS) {
        const template = templateById('compact', format);
        for (const ids of randomGroups(seed, 8)) {
          const scene = layoutScene(objects(ids, format), template, seed);
          const notes = forbidden(scene.objects, scene.scale);
          if (notes.length > 0) {
            failures.push(
              `${format} seed ${seed} ${ids.join('+')}: ${notes.join('; ')}`,
            );
          }
        }
      }
    }
    expect(failures.slice(0, 8)).toEqual([]);
    expect(failures).toHaveLength(0);
  });

  it('keeps backdrop centers inside the frame for names and meaning on every format', () => {
    const failures: string[] = [];
    const templates = ['compact', 'offset', 'under-title'] as const;
    for (const format of FORMATS_IDS) {
      const frame = FORMATS[format];
      const named = composePlacements(
        [
          { objectId: 'book', count: 1 },
          { objectId: 'phone', count: 1 },
        ],
        { format, seed: 2 },
      );
      for (const background of named.objects) {
        if (background.role !== 'background') continue;
        const box = axisBox(background, named.scale);
        const visible = visibleFraction(box, frame);
        if (visible < 0.38 || visible > 0.62) {
          failures.push(
            `names ${format} ${background.objectId} ${visible.toFixed(2)}`,
          );
        }
      }
      for (const template of templates) {
        const scene = composePick(
          {
            main: ['book', 'coin'],
            background: ['lamp'],
            template,
          },
          { format, seed: 3 },
        );
        const lamp = scene.objects.find((object) => object.objectId === 'lamp');
        if (!lamp) {
          failures.push(`meaning ${format} ${template} missing lamp`);
          continue;
        }
        const box = axisBox(lamp, scene.scale);
        const visible = visibleFraction(box, frame);
        if (visible < 0.38 || visible > 0.62) {
          failures.push(
            `meaning ${format} ${template} ${visible.toFixed(2)} @${lamp.x.toFixed(0)},${lamp.y.toFixed(0)}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
