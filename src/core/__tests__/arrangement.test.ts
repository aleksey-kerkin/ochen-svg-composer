import { describe, expect, it } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import { FORMATS } from '../../model/formats.ts';
import type {
  FormatId,
  LayoutTemplate,
  Manifest,
  PlacedObject,
} from '../../model/types.ts';
import { ensureBackdrop } from '../backdrop.ts';
import {
  axisBox,
  contains,
  intersection,
  visibleFraction,
} from '../geometry.ts';
import { layoutScene, templateById, type TemplateId } from '../layout.ts';
import { depthAnchor } from '../arrange.ts';
import { canRest, faceOf, PLACEMENT, profile } from '../profiles.ts';

const library = manifest as Manifest;
const IDS = library.items.map((item) => item.objectId);
const FORMATS_IDS: FormatId[] = ['landscape', 'square', 'portrait'];
const TEMPLATE_IDS: TemplateId[] = ['under-title', 'offset', 'compact'];

function svgSize(objectId: string): { w: number; h: number } {
  const item = library.items.find((entry) => entry.objectId === objectId);
  const asset = item?.assets.find(
    (entry) => entry.size === 'L' && entry.role === 'main',
  );
  if (!asset) throw new Error(objectId);
  return asset.svgSize;
}

function fitsOn(riderId: string, supportId: string): boolean {
  const rider = svgSize(riderId);
  const support = svgSize(supportId);
  const face = profile(supportId).face;
  return (
    rider.w <= support.w * face.w + 0.5 && rider.h <= support.h * face.h + 0.5
  );
}

function combinations(ids: string[], size: number): string[][] {
  const groups: string[][] = [];
  const walk = (start: number, picked: string[]) => {
    if (picked.length === size) {
      groups.push([...picked]);
      return;
    }
    for (let index = start; index < ids.length; index += 1) {
      const id = ids[index];
      if (!id) continue;
      picked.push(id);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return groups;
}

function sceneObjects(ids: string[], format: FormatId): PlacedObject[] {
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

function insideFrame(
  object: PlacedObject,
  scale: number,
  frame: { w: number; h: number },
): boolean {
  const box = axisBox(object, scale);
  return (
    box.x >= -2 &&
    box.y >= -2 &&
    box.x + box.w <= frame.w + 2 &&
    box.y + box.h <= frame.h + 2
  );
}

function problems(
  objects: PlacedObject[],
  scale: number,
  template: LayoutTemplate,
): string[] {
  const frame = FORMATS[template.format];
  const notes: string[] = [];
  const mains = objects.filter((object) => object.role === 'main');
  const backgrounds = objects.filter((object) => object.role === 'background');
  for (const object of mains) {
    if (!insideFrame(object, scale, frame)) {
      notes.push(`${object.objectId} leaves the frame`);
    }
  }
  if (template.safeArea) {
    const floor = (template.safeArea.y + template.safeArea.h) * frame.h;
    for (const object of mains) {
      if (object.y < floor - 1)
        notes.push(`${object.objectId} sits in the title`);
    }
  }
  for (let left = 0; left < mains.length; left += 1) {
    for (let right = left + 1; right < mains.length; right += 1) {
      const a = mains[left];
      const b = mains[right];
      if (!a || !b) continue;
      const hit = intersection(axisBox(a, scale), axisBox(b, scale));
      if (!hit) {
        const ay = depthAnchor(a, mains, scale);
        const by = depthAnchor(b, mains, scale);
        if (Math.abs(ay - by) > 1) {
          const lower = ay > by ? a : b;
          const upper = lower === a ? b : a;
          if (lower.z <= upper.z)
            notes.push(`${lower.objectId} is not in front`);
        }
        continue;
      }
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
        ) ||
        rider.z <= support.z
      ) {
        notes.push(`${a.objectId} cuts ${b.objectId}`);
      }
    }
  }
  const minMainZ = Math.min(...mains.map((object) => object.z));
  for (const background of backgrounds) {
    if (background.z >= minMainZ)
      notes.push(`${background.objectId} is in front`);
    const visible = visibleFraction(axisBox(background, scale), frame);
    if (visible < 0.85) {
      notes.push(`${background.objectId} shows ${Math.round(visible * 100)}%`);
    }
    for (const main of mains) {
      if (intersection(axisBox(background, scale), axisBox(main, scale))) {
        notes.push(`${background.objectId} covers ${main.objectId}`);
      }
    }
  }
  return notes;
}

describe('placement profiles', () => {
  it('describes every library object and only lists partners that fit the face', () => {
    expect(Object.keys(PLACEMENT).sort()).toEqual([...IDS].sort());
    for (const entry of Object.values(PLACEMENT)) {
      for (const partner of entry.partners) {
        expect(IDS).toContain(partner);
        expect(fitsOn(partner, entry.objectId)).toBe(true);
      }
      expect(entry.face.x).toBeGreaterThanOrEqual(0);
      expect(entry.face.y).toBeGreaterThanOrEqual(0);
      expect(entry.face.x + entry.face.w).toBeLessThanOrEqual(1);
      expect(entry.face.y + entry.face.h).toBeLessThanOrEqual(1);
    }
    expect(fitsOn('phone', 'book')).toBe(true);
    expect(fitsOn('coin', 'wallet')).toBe(true);
    expect(fitsOn('headphones', 'book')).toBe(false);
    expect(canRest('pen', 'folder')).toBe(true);
    expect(canRest('lamp', 'book')).toBe(false);
  });
});

describe('arrangement of every group', () => {
  it('packs every pair and triple in every format and template', () => {
    const groups = [...combinations(IDS, 2), ...combinations(IDS, 3)];
    const failures: string[] = [];
    for (const format of FORMATS_IDS) {
      for (const templateId of TEMPLATE_IDS) {
        const template = templateById(templateId, format);
        for (const group of groups) {
          const scene = layoutScene(sceneObjects(group, format), template, 1);
          const notes = problems(scene.objects, scene.scale, template);
          if (notes.length > 0) {
            failures.push(
              `${format} ${templateId} ${group.join('+')}: ${notes.join('; ')}`,
            );
          }
        }
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
    expect(failures).toHaveLength(0);
  });
});
