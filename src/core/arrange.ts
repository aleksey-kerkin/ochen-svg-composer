import { FORMATS } from '../model/formats.ts';
import type { LayoutTemplate, PlacedObject } from '../model/types.ts';
import {
  type Box,
  RIDERS,
  SUPPORTS,
  axisBox,
  contains,
  crossesFrame,
  faceLift,
  intersection,
  renderedSize,
  topFace,
} from './geometry.ts';

const GAP = 12;

function clone(object: PlacedObject): PlacedObject {
  const next: PlacedObject = {
    uid: object.uid,
    objectId: object.objectId,
    role: object.role,
    x: object.x,
    y: object.y,
    rotation: 0,
    z: object.z,
  };
  if (object.colorShift !== undefined) next.colorShift = object.colorShift;
  return next;
}

function overlaps(box: Box, placed: Box[], gap: number): boolean {
  const grown = {
    x: box.x - gap,
    y: box.y - gap,
    w: box.w + gap * 2,
    h: box.h + gap * 2,
  };
  return placed.some((other) => intersection(grown, other) !== null);
}

function visibleFraction(box: Box, frame: { w: number; h: number }): number {
  const hit = intersection(box, { x: 0, y: 0, w: frame.w, h: frame.h });
  if (!hit) return 0;
  return (hit.w * hit.h) / (box.w * box.h);
}

function safeFloor(template: LayoutTemplate, frame: { h: number }): number {
  const safe = template.safeArea;
  if (!safe) return 0;
  return (safe.y + safe.h) * frame.h;
}

function search(
  object: PlacedObject,
  placed: Box[],
  template: LayoutTemplate,
  frame: { w: number; h: number },
  prefer: 'high' | 'low',
): { x: number; y: number } {
  const scale = template.scale;
  const size = renderedSize(object, scale);
  const floor = safeFloor(template, frame);
  let best: { x: number; y: number; score: number } | null = null;
  for (let pass = 0; pass < 2; pass += 1) {
    const minVisible = pass === 0 ? 0.42 : 0.22;
    for (let iy = 0; iy <= 32; iy += 1) {
      for (let ix = 0; ix <= 38; ix += 1) {
        const fx = -0.22 + ix * 0.04;
        const fy = -0.08 + iy * 0.04;
        const x = fx * frame.w;
        const y = fy * frame.h;
        if (y <= floor) continue;
        const box = {
          x: x - size.w / 2,
          y: y - size.h / 2,
          w: size.w,
          h: size.h,
        };
        if (overlaps(box, placed, GAP)) continue;
        const visible = visibleFraction(box, frame);
        if (visible < minVisible) continue;
        const priorX = prefer === 'high' ? 0.36 : 0.66;
        const priorY = prefer === 'high' ? 0.36 : 0.72;
        const dist = Math.abs(fx - priorX) + Math.abs(fy - priorY);
        const score = visible * 4 - dist;
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    if (best) return best;
  }
  const right = placed.reduce((max, box) => Math.max(max, box.x + box.w), 0);
  return {
    x: right + GAP + size.w / 2,
    y: Math.max(floor + size.h / 2 + 8, frame.h * 0.72),
  };
}

function placeSupport(
  object: PlacedObject,
  template: LayoutTemplate,
  frame: { w: number; h: number },
  random: () => number,
): void {
  const size = renderedSize(object, template.scale);
  // Landscape books are wider than the short side, so the support sits
  // left of center and a rider that does not fit on the pages can show
  // beside it instead of leaving the frame.
  const faceX =
    frame.w *
    (template.format === 'landscape'
      ? 0.3
      : template.id === 'offset'
        ? 0.34
        : 0.42);
  const faceY =
    frame.h *
    (template.safeArea ? 0.64 : template.format === 'portrait' ? 0.38 : 0.5);
  const jx = (random() * 2 - 1) * frame.w * 0.012;
  const jy = (random() * 2 - 1) * frame.h * 0.012;
  object.x = faceX + jx;
  object.y = faceY + faceLift(size.h) + jy;
  object.rotation = 0;
  const floor = safeFloor(template, frame);
  const minY = floor + faceLift(size.h) + 8;
  if (object.y < minY) object.y = minY;
}

function stackOn(
  object: PlacedObject,
  supports: PlacedObject[],
  riderBoxes: Box[],
  template: LayoutTemplate,
  frame: { w: number; h: number },
  random: () => number,
): boolean {
  const scale = template.scale;
  const size = renderedSize(object, scale);
  const floor = safeFloor(template, frame);
  const jx = (random() * 2 - 1) * Math.min(18, frame.w * 0.012);
  const jy = (random() * 2 - 1) * Math.min(12, frame.h * 0.012);
  for (const support of supports) {
    const face = topFace(axisBox(support, scale));
    if (size.w > face.w || size.h > face.h) continue;
    const cx = face.x + face.w / 2;
    const cy = face.y + face.h / 2;
    const spots = [
      { x: cx + jx, y: cy + jy },
      { x: cx, y: cy },
      { x: face.x + size.w / 2 + 6, y: cy },
      { x: face.x + face.w - size.w / 2 - 6, y: cy },
    ];
    for (const spot of spots) {
      if (spot.y <= floor) continue;
      const box = {
        x: spot.x - size.w / 2,
        y: spot.y - size.h / 2,
        w: size.w,
        h: size.h,
      };
      if (!contains(face, box)) continue;
      if (overlaps(box, riderBoxes, 8)) continue;
      object.x = spot.x;
      object.y = spot.y;
      object.rotation = 0;
      return true;
    }
  }
  return false;
}

/**
 * Places two or more main objects so a rider lies fully on a support's top
 * face or beside it, and everything else keeps a gap between boxes.
 */
export function arrangeMains(
  mains: PlacedObject[],
  template: LayoutTemplate,
  random: () => number,
): PlacedObject[] {
  const frame = FORMATS[template.format];
  const scale = template.scale;
  const copies = mains.map(clone);
  const supports = copies.filter((object) => SUPPORTS.has(object.objectId));
  const riders = copies
    .filter((object) => RIDERS.has(object.objectId))
    .sort(
      (left, right) =>
        renderedSize(right, scale).w * renderedSize(right, scale).h -
        renderedSize(left, scale).w * renderedSize(left, scale).h,
    );
  const others = copies
    .filter(
      (object) =>
        !SUPPORTS.has(object.objectId) && !RIDERS.has(object.objectId),
    )
    .sort(
      (left, right) =>
        renderedSize(right, scale).w * renderedSize(right, scale).h -
        renderedSize(left, scale).w * renderedSize(left, scale).h,
    );

  const occupied: Box[] = [];
  supports.forEach((object, index) => {
    if (index === 0) placeSupport(object, template, frame, random);
    else {
      const spot = search(object, occupied, template, frame, 'low');
      object.x = spot.x;
      object.y = spot.y;
      object.rotation = 0;
    }
    let box = axisBox(object, scale);
    if (overlaps(box, occupied, GAP)) {
      const spot = search(object, occupied, template, frame, 'low');
      object.x = spot.x;
      object.y = spot.y;
    }
    box = axisBox(object, scale);
    occupied.push(box);
  });

  others.forEach((object, index) => {
    const spot = search(
      object,
      occupied,
      template,
      frame,
      index === 0 ? 'high' : 'low',
    );
    object.x = spot.x;
    object.y = spot.y;
    object.rotation = 0;
    occupied.push(axisBox(object, scale));
  });

  const riderBoxes: Box[] = [];
  for (const object of riders) {
    const stacked = stackOn(
      object,
      supports,
      riderBoxes,
      template,
      frame,
      random,
    );
    if (!stacked) {
      const spot = search(
        object,
        [...occupied, ...riderBoxes],
        template,
        frame,
        'low',
      );
      object.x = spot.x;
      object.y = spot.y;
      object.rotation = 0;
    }
    riderBoxes.push(axisBox(object, scale));
  }

  return copies;
}

function pointIn(x: number, y: number, box: Box): boolean {
  return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
}

/** Share of the box that is inside the frame and not covered by a main. */
function openFraction(
  box: Box,
  mains: Box[],
  frame: { w: number; h: number },
): number {
  const steps = 7;
  let open = 0;
  for (let iy = 0; iy < steps; iy += 1) {
    for (let ix = 0; ix < steps; ix += 1) {
      const x = box.x + (box.w * (ix + 0.5)) / steps;
      const y = box.y + (box.h * (iy + 0.5)) / steps;
      if (x < 0 || y < 0 || x > frame.w || y > frame.h) continue;
      if (mains.some((main) => pointIn(x, y, main))) continue;
      open += 1;
    }
  }
  return open / (steps * steps);
}

/**
 * Parks monochrome objects on the frame edge, behind the mains, with enough
 * of each one left uncovered to read.
 */
export function placeEdgeBackgrounds(
  backgrounds: PlacedObject[],
  mains: PlacedObject[],
  template: LayoutTemplate,
  random: () => number,
): PlacedObject[] {
  const frame = FORMATS[template.format];
  const scale = template.scale;
  const mainBoxes = mains.map((object) => axisBox(object, scale));
  const copies = backgrounds.map(clone);
  const ordered = [...copies].sort(
    (left, right) =>
      renderedSize(right, scale).w * renderedSize(right, scale).h -
      renderedSize(left, scale).w * renderedSize(left, scale).h,
  );
  const occupied: Box[] = [];
  for (const object of ordered) {
    const size = renderedSize(object, scale);
    let best: { x: number; y: number; score: number } | null = null;
    for (let iy = 0; iy <= 16; iy += 1) {
      for (let ix = 0; ix <= 16; ix += 1) {
        const fx = -0.2 + ix * 0.0875;
        const fy = -0.2 + iy * 0.0875;
        const onEdge = fx < 0.28 || fx > 0.72 || fy < 0.28 || fy > 0.72;
        if (!onEdge) continue;
        const x = fx * frame.w;
        const y = fy * frame.h;
        const box = {
          x: x - size.w / 2,
          y: y - size.h / 2,
          w: size.w,
          h: size.h,
        };
        if (!crossesFrame(box, frame)) continue;
        if (overlaps(box, occupied, 4)) continue;
        const open = openFraction(box, mainBoxes, frame);
        if (open < 0.14) continue;
        const score = open - Math.abs(open - 0.36);
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    const jx = (random() * 2 - 1) * frame.w * 0.008;
    const jy = (random() * 2 - 1) * frame.h * 0.008;
    if (best) {
      object.x = best.x + jx;
      object.y = best.y + jy;
    } else {
      object.x = -0.04 * frame.w + jx;
      object.y = 0.22 * frame.h + jy;
    }
    object.rotation = 0;
    const box = axisBox(object, scale);
    if (!crossesFrame(box, frame) && best) {
      object.x = best.x;
      object.y = best.y;
    }
    occupied.push(axisBox(object, scale));
  }
  return copies;
}

/** Backgrounds stay behind. Among mains, lower in the frame is closer. */
export function orderByDepth(
  backgrounds: PlacedObject[],
  mains: PlacedObject[],
  scale: number,
): PlacedObject[] {
  const byDepth = (left: PlacedObject, right: PlacedObject) =>
    left.y - right.y || left.uid.localeCompare(right.uid);
  const ordered = [
    ...[...backgrounds].sort(byDepth),
    ...[...mains].sort(byDepth),
  ];
  ordered.forEach((object, index) => {
    object.z = index;
  });
  for (const rider of mains) {
    if (!RIDERS.has(rider.objectId)) continue;
    const support = mains.find((object) => {
      if (!SUPPORTS.has(object.objectId)) return false;
      return contains(topFace(axisBox(object, scale)), axisBox(rider, scale));
    });
    if (!support || rider.z > support.z) continue;
    const z = rider.z;
    rider.z = support.z;
    support.z = z;
  }
  return ordered.sort((left, right) => left.z - right.z);
}
