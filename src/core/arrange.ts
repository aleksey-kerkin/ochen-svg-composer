import { FORMATS } from '../model/formats.ts';
import type { LayoutTemplate, PlacedObject } from '../model/types.ts';
import {
  type Box,
  axisBox,
  contains,
  crossesFrame,
  intersection,
  renderedSize,
} from './geometry.ts';
import { canRest, faceOf, footprintOf, profile } from './profiles.ts';

const GAP = 14;

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

function unionBox(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Inner rect the main group must occupy. Under-title keeps a title band. */
export function contentBox(
  template: LayoutTemplate,
  frame: { w: number; h: number },
): Box {
  const insetX = 0.04;
  const bottom = 0.04;
  if (template.safeArea) {
    const top = 0.32;
    return {
      x: frame.w * insetX,
      y: frame.h * top,
      w: frame.w * (1 - insetX * 2),
      h: frame.h * (1 - top - bottom),
    };
  }
  if (template.id === 'offset') {
    return {
      x: frame.w * 0.03,
      y: frame.h * 0.05,
      w: frame.w * 0.82,
      h: frame.h * 0.9,
    };
  }
  return {
    x: frame.w * insetX,
    y: frame.h * 0.05,
    w: frame.w * (1 - insetX * 2),
    h: frame.h * 0.9,
  };
}

function areaOf(object: PlacedObject, scale: number): number {
  const size = renderedSize(object, scale);
  return size.w * size.h;
}

interface Seat {
  rider: PlacedObject;
  support: PlacedObject;
  ox: number;
  oy: number;
}

function findSpot(
  size: { w: number; h: number },
  face: { w: number; h: number },
  reserved: Box[],
): { cx: number; cy: number; box: Box } | null {
  if (size.w > face.w + 0.5 || size.h > face.h + 0.5) return null;
  const y = (face.h - size.h) / 2;
  if (reserved.length === 0) {
    const box = { x: (face.w - size.w) / 2, y, w: size.w, h: size.h };
    return { cx: face.w / 2, cy: face.h / 2, box };
  }
  for (let x = 0; x <= face.w - size.w + 0.5; x += 6) {
    const box = { x, y, w: size.w, h: size.h };
    if (reserved.some((other) => intersection(box, other) !== null)) continue;
    return { cx: box.x + size.w / 2, cy: box.y + size.h / 2, box };
  }
  return null;
}

function faceSize(
  object: PlacedObject,
  scale: number,
): { w: number; h: number } {
  const size = renderedSize(object, scale);
  const face = profile(object.objectId).face;
  return { w: size.w * face.w, h: size.h * face.h };
}

function placeRow(
  items: PlacedObject[],
  template: LayoutTemplate,
  frame: { w: number; h: number },
  scale: number,
): void {
  if (items.length === 0) return;
  const content = contentBox(template, frame);
  const gap = Math.max(GAP, frame.w * 0.012);
  const ordered = [...items].sort(
    (left, right) => areaOf(right, scale) - areaOf(left, scale),
  );
  const frontCount =
    ordered.length > 3 ? Math.ceil(ordered.length / 2) : ordered.length;
  const front = ordered.slice(0, frontCount);
  const back = ordered.slice(frontCount);
  const baseline = content.y + content.h;

  const placeLine = (line: PlacedObject[], bottom: number) => {
    const widths = line.map((object) => renderedSize(object, scale).w);
    const total =
      widths.reduce((sum, width) => sum + width, 0) +
      gap * Math.max(0, line.length - 1);
    let x = content.x + Math.max(0, content.w - total) / 2;
    if (template.id === 'offset') {
      x = content.x + Math.max(0, content.w - total) * 0.18;
    }
    for (let index = 0; index < line.length; index += 1) {
      const object = line[index];
      const size = renderedSize(object!, scale);
      if (!object) continue;
      object.x = x + size.w / 2;
      object.y = bottom - size.h / 2;
      object.rotation = 0;
      x += size.w + gap;
    }
  };

  placeLine(front, baseline);
  if (back.length > 0) {
    const frontH = Math.max(
      ...front.map((object) => renderedSize(object, scale).h),
    );
    placeLine(back, baseline - frontH - gap);
  }
}

function translate(objects: PlacedObject[], dx: number, dy: number): void {
  for (const object of objects) {
    object.x += dx;
    object.y += dy;
  }
}

function clampGroup(
  objects: PlacedObject[],
  template: LayoutTemplate,
  frame: { w: number; h: number },
  scale: number,
): void {
  if (objects.length === 0) return;
  const content = contentBox(template, frame);
  const boxes = objects.map((object) => axisBox(object, scale));
  const union = unionBox(boxes);
  let dx = 0;
  let dy = 0;
  if (union.w <= content.w + 0.5) {
    if (union.x < content.x) dx = content.x - union.x;
    else if (union.x + union.w > content.x + content.w) {
      dx = content.x + content.w - (union.x + union.w);
    }
  }
  if (union.h <= content.h + 0.5) {
    if (union.y < content.y) dy = content.y - union.y;
    else if (union.y + union.h > content.y + content.h) {
      dy = content.y + content.h - (union.y + union.h);
    }
  }
  translate(objects, dx, dy);
}

function arrangeAt(
  mains: PlacedObject[],
  template: LayoutTemplate,
  random: () => number,
  scale: number,
): PlacedObject[] {
  const frame = FORMATS[template.format];
  const copies = mains.map(clone);
  const supports = copies.filter(
    (object) => profile(object.objectId).partners.length > 0,
  );
  const riders = copies
    .filter((object) => profile(object.objectId).anchor === 'top')
    .sort((left, right) => areaOf(right, scale) - areaOf(left, scale));
  const stands = copies.filter(
    (object) => profile(object.objectId).anchor === 'side',
  );
  const reserved = new Map<string, Box[]>();
  const seats: Seat[] = [];
  const unseated: PlacedObject[] = [];

  for (const rider of riders) {
    const size = renderedSize(rider, scale);
    const options = supports
      .filter((support) => canRest(rider.objectId, support.objectId))
      .sort(
        (left, right) =>
          faceSize(right, scale).w * faceSize(right, scale).h -
          faceSize(left, scale).w * faceSize(left, scale).h,
      );
    let seated = false;
    for (const support of options) {
      const face = faceSize(support, scale);
      const spot = findSpot(size, face, reserved.get(support.uid) ?? []);
      if (!spot) continue;
      const taken = reserved.get(support.uid) ?? [];
      taken.push(spot.box);
      reserved.set(support.uid, taken);
      seats.push({ rider, support, ox: spot.cx, oy: spot.cy });
      seated = true;
      break;
    }
    if (!seated) unseated.push(rider);
  }

  const grounded = [...supports, ...stands, ...unseated];
  placeRow(grounded, template, frame, scale);
  for (const seat of seats) {
    const face = faceOf(seat.support.objectId, axisBox(seat.support, scale));
    seat.rider.x = face.x + seat.ox;
    seat.rider.y = face.y + seat.oy;
    seat.rider.rotation = 0;
  }

  const jx = (random() * 2 - 1) * frame.w * 0.01;
  const jy = (random() * 2 - 1) * frame.h * 0.01;
  translate(copies, jx, jy);
  clampGroup(copies, template, frame, scale);
  return copies;
}

function roomForBackdrop(
  boxes: Box[],
  frame: { w: number; h: number },
): boolean {
  if (boxes.length === 0) return true;
  const union = unionBox(boxes);
  const left = union.x;
  const right = frame.w - (union.x + union.w);
  const top = union.y;
  const bottom = frame.h - (union.y + union.h);
  return (
    Math.max(left, right) > frame.w * 0.07 ||
    Math.max(top, bottom) > frame.h * 0.07
  );
}

function placementFits(
  mains: PlacedObject[],
  template: LayoutTemplate,
  scale: number,
  reserveBackdrop: boolean,
): boolean {
  const frame = FORMATS[template.format];
  const placed = arrangeAt(mains, template, () => 0.5, scale);
  const content = contentBox(template, frame);
  const boxes = placed.map((object) => axisBox(object, scale));
  for (const box of boxes) {
    if (!contains(content, box)) return false;
  }
  for (let left = 0; left < placed.length; left += 1) {
    for (let right = left + 1; right < placed.length; right += 1) {
      const a = placed[left];
      const b = placed[right];
      if (!a || !b) continue;
      const hit = intersection(
        footprintOf(a.objectId, axisBox(a, scale)),
        footprintOf(b.objectId, axisBox(b, scale)),
      );
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
        return false;
      }
    }
  }
  if (template.safeArea) {
    const floor = (template.safeArea.y + template.safeArea.h) * frame.h;
    if (placed.some((object) => object.y < floor)) return false;
  }
  if (reserveBackdrop && !roomForBackdrop(boxes, frame)) return false;
  return true;
}

/** Largest scale at or below the template scale that keeps the group inside. */
export function fitScale(
  mains: PlacedObject[],
  template: LayoutTemplate,
  reserveBackdrop: boolean,
): number {
  if (mains.length <= 1) return template.scale;
  if (placementFits(mains, template, template.scale, reserveBackdrop)) {
    return template.scale;
  }
  let low = 0.14;
  let high = template.scale;
  if (!placementFits(mains, template, low, reserveBackdrop)) return low;
  for (let step = 0; step < 18; step += 1) {
    const mid = (low + high) / 2;
    if (placementFits(mains, template, mid, reserveBackdrop)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Places two or more main objects. A top item lies fully on a support's
 * face or stands beside the group. Everyone else shares one ground line.
 */
export function arrangeMains(
  mains: PlacedObject[],
  template: LayoutTemplate,
  random: () => number,
): PlacedObject[] {
  return arrangeAt(mains, template, random, template.scale);
}

type Side = 'left' | 'right' | 'top' | 'bottom';

function spotFor(
  side: Side,
  size: { w: number; h: number },
  mains: Box[],
  frame: { w: number; h: number },
  band: number,
): { x: number; y: number } | null {
  const union = unionBox(mains);
  const gap = 8;
  if (side === 'left' || side === 'right') {
    const limit =
      side === 'left' ? union.x - gap : frame.w - (union.x + union.w) - gap;
    if (limit < 12) return null;
    const edge = Math.min(limit, Math.max(size.w * 0.38, 28));
    const y = frame.h * band;
    const x = side === 'left' ? edge - size.w / 2 : frame.w - edge + size.w / 2;
    return { x, y };
  }
  const limit =
    side === 'top' ? union.y - gap : frame.h - (union.y + union.h) - gap;
  if (limit < 12) return null;
  const edge = Math.min(limit, Math.max(size.h * 0.38, 28));
  const x = frame.w * band;
  const y = side === 'top' ? edge - size.h / 2 : frame.h - edge + size.h / 2;
  return { x, y };
}

/**
 * Parks monochrome objects on the frame edge, behind the mains, cropped by
 * the frame and clear of every main box.
 */
export function placeEdgeBackgrounds(
  backgrounds: PlacedObject[],
  mains: PlacedObject[],
  template: LayoutTemplate,
  random: () => number,
): PlacedObject[] {
  const frame = FORMATS[template.format];
  const scale = template.scale;
  const mainBoxes =
    mains.length > 0
      ? mains.map((object) => axisBox(object, scale))
      : [
          {
            x: frame.w * 0.3,
            y: frame.h * 0.3,
            w: frame.w * 0.4,
            h: frame.h * 0.4,
          },
        ];
  const copies = backgrounds.map(clone);
  const ordered = [...copies].sort(
    (left, right) => areaOf(right, scale) - areaOf(left, scale),
  );
  const occupied: Box[] = [];
  const sides: Side[] = ['left', 'right', 'top', 'bottom'];
  ordered.forEach((object, index) => {
    const size = renderedSize(object, scale);
    const bands = [0.35, 0.62, 0.5];
    let chosen: { x: number; y: number } | null = null;
    for (let pass = 0; pass < 8 && !chosen; pass += 1) {
      const side = sides[(index + pass) % sides.length] ?? 'left';
      const band = bands[pass % bands.length] ?? 0.5;
      const spot = spotFor(side, size, mainBoxes, frame, band);
      if (!spot) continue;
      const box = {
        x: spot.x - size.w / 2,
        y: spot.y - size.h / 2,
        w: size.w,
        h: size.h,
      };
      if (!crossesFrame(box, frame)) continue;
      if (overlaps(box, mainBoxes, 4)) continue;
      if (overlaps(box, occupied, 4)) continue;
      const visible = visibleFraction(box, frame);
      if (visible < 0.08 || visible > 0.62) continue;
      chosen = spot;
    }
    if (!chosen) {
      const spot = spotFor('left', size, mainBoxes, frame, 0.42 + index * 0.2);
      chosen = spot ?? {
        x: -size.w * 0.35,
        y: frame.h * (0.3 + index * 0.3),
      };
    }
    const jx = (random() * 2 - 1) * frame.w * 0.006;
    const jy = (random() * 2 - 1) * frame.h * 0.006;
    object.x = chosen.x + jx;
    object.y = chosen.y + jy;
    object.rotation = 0;
    let box = axisBox(object, scale);
    if (overlaps(box, mainBoxes, 2) || !crossesFrame(box, frame)) {
      object.x = chosen.x;
      object.y = chosen.y;
      box = axisBox(object, scale);
    }
    occupied.push(box);
  });
  return copies;
}

function restsOn(
  rider: PlacedObject,
  support: PlacedObject,
  scale: number,
): boolean {
  if (!canRest(rider.objectId, support.objectId)) return false;
  return contains(
    faceOf(support.objectId, axisBox(support, scale)),
    axisBox(rider, scale),
  );
}

/** A rider shares its support's depth. Everyone else uses its own center. */
export function depthAnchor(
  object: PlacedObject,
  mains: PlacedObject[],
  scale: number,
): number {
  const support = mains.find(
    (other) => other.uid !== object.uid && restsOn(object, other, scale),
  );
  return support ? support.y : object.y;
}

/** Backgrounds stay behind. Among mains, lower in the frame is closer. */
export function orderByDepth(
  backgrounds: PlacedObject[],
  mains: PlacedObject[],
  scale: number,
): PlacedObject[] {
  const byDepth = (left: PlacedObject, right: PlacedObject) =>
    depthAnchor(left, mains, scale) - depthAnchor(right, mains, scale) ||
    left.uid.localeCompare(right.uid);
  const ordered = [
    ...[...backgrounds].sort(
      (left, right) => left.y - right.y || left.uid.localeCompare(right.uid),
    ),
    ...[...mains].sort(byDepth),
  ];
  const riders = [...mains]
    .filter((rider) => mains.some((support) => restsOn(rider, support, scale)))
    .sort((left, right) => right.y - left.y);
  for (const rider of riders) {
    const support = mains.find((object) => restsOn(rider, object, scale));
    if (!support) continue;
    const from = ordered.indexOf(rider);
    const at = ordered.indexOf(support);
    if (from < 0 || at < 0 || from > at) continue;
    ordered.splice(from, 1);
    ordered.splice(ordered.indexOf(support) + 1, 0, rider);
  }
  ordered.forEach((object, index) => {
    object.z = index;
  });
  return ordered;
}
