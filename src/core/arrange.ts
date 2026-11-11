import { FORMATS } from '../model/formats.ts';
import type { LayoutTemplate, PlacedObject } from '../model/types.ts';
import {
  type Box,
  axisBox,
  contains,
  crossesFrame,
  intersection,
  renderedSize,
  visibleFraction,
} from './geometry.ts';
import { canRest, faceOf, footprintOf, profile } from './profiles.ts';

const GAP = 8;
const MIN_VISIBLE = 0.6;

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

/**
 * Aspect the packed group should have before it is scaled to the frame.
 * Under a title the group stays short so its centers sit in the lower band.
 */
export function groupAspect(
  template: LayoutTemplate,
  frame: { w: number; h: number },
): number {
  if (template.safeArea) return frame.w / (frame.h * 0.56);
  return frame.w / frame.h;
}

function boxAt(
  center: { x: number; y: number },
  size: { w: number; h: number },
): Box {
  return {
    x: center.x - size.w / 2,
    y: center.y - size.h / 2,
    w: size.w,
    h: size.h,
  };
}

/** Beside and above/below the union, still touching on one axis. */
function diagonalSpots(
  size: { w: number; h: number },
  union: Box,
  gap: number,
): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  const yLimit = (union.h + size.h) / 2 - 2;
  const xLimit = (union.w + size.w) / 2 - 2;
  const steps = [-1, -0.72, -0.4, -0.15, 0.15, 0.4, 0.72, 1];
  const midY = union.y + union.h / 2;
  const midX = union.x + union.w / 2;
  for (const x of [
    union.x + union.w + gap + size.w / 2,
    union.x - gap - size.w / 2,
  ]) {
    for (const step of steps) spots.push({ x, y: midY + yLimit * step });
  }
  for (const y of [
    union.y - gap - size.h / 2,
    union.y + union.h + gap + size.h / 2,
  ]) {
    for (const step of steps) spots.push({ x: midX + xLimit * step, y });
  }
  return spots;
}

/**
 * Next object on the isometric diagonal. Up-right is further, down-left is
 * nearer. The spot that lands closest to `target` wins, and a second
 * background is kept well below or above the first.
 */
function gapBetween(box: Box, other: Box): number {
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

function chooseSpot(
  object: PlacedObject,
  occupied: Box[],
  scale: number,
  gap: number,
  target: number,
  peers: number[] = [],
  minPeerDy = 0,
  anchor?: Box,
  maxAway = Number.POSITIVE_INFINITY,
): { x: number; y: number } {
  const size = renderedSize(object, scale);
  const union = unionBox(occupied);
  const spots = diagonalSpots(size, union, gap);
  const picked =
    pick(true, true) ??
    pick(false, true) ??
    pick(true, false) ??
    pick(false, false);
  if (picked) return picked;
  return {
    x: union.x + union.w + gap + size.w / 2,
    y: union.y + union.h / 2,
  };

  function pick(
    respectPeers: boolean,
    stayClose: boolean,
  ): { x: number; y: number } | null {
    let best: { x: number; y: number; score: number } | null = null;
    for (const spot of spots) {
      if (
        respectPeers &&
        peers.some((peerY) => Math.abs(peerY - spot.y) < minPeerDy)
      ) {
        continue;
      }
      const box = boxAt(spot, size);
      if (overlaps(box, occupied, 1)) continue;
      if (stayClose && anchor && gapBetween(box, anchor) > maxAway) continue;
      const next = unionBox([...occupied, box]);
      const aspect = next.w / Math.max(next.h, 1);
      const error = Math.abs(Math.log(aspect / target));
      const above = spot.y < union.y + union.h * 0.35;
      const below = spot.y > union.y + union.h * 0.65;
      const right = spot.x > union.x + union.w / 2;
      const left = spot.x < union.x + union.w / 2;
      const diagonal = (above && right) || (below && left);
      const away = anchor ? gapBetween(box, anchor) : 0;
      const score = error * (diagonal ? 0.78 : 1) + away / 4000;
      if (!best || score < best.score) best = { x: spot.x, y: spot.y, score };
    }
    return best;
  }
}

function placeRow(
  items: PlacedObject[],
  template: LayoutTemplate,
  frame: { w: number; h: number },
  scale: number,
): void {
  if (items.length === 0) return;
  const content = contentBox(template, frame);
  const gap = Math.max(GAP, frame.w * 0.008);
  const ordered = [...items].sort(
    (left, right) => areaOf(right, scale) - areaOf(left, scale),
  );
  const first = ordered[0];
  if (!first) return;
  const firstSize = renderedSize(first, scale);
  if (ordered.length === 1) {
    let x = content.x + Math.max(0, content.w - firstSize.w) / 2;
    if (template.id === 'offset') {
      x = content.x + Math.max(0, content.w - firstSize.w) * 0.18;
    }
    first.x = x + firstSize.w / 2;
    first.y = content.y + content.h - firstSize.h / 2;
    first.rotation = 0;
    return;
  }
  first.x = firstSize.w / 2;
  first.y = firstSize.h / 2;
  first.rotation = 0;
  const occupied = [boxAt({ x: first.x, y: first.y }, firstSize)];
  const target = groupAspect(template, frame);
  for (const object of ordered.slice(1)) {
    const spot = chooseSpot(object, occupied, scale, gap, target);
    object.x = spot.x;
    object.y = spot.y;
    object.rotation = 0;
    occupied.push(boxAt(spot, renderedSize(object, scale)));
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

  centerInContent(copies, template, frame, scale);
  const jx = (random() * 2 - 1) * frame.w * 0.008;
  const jy = (random() * 2 - 1) * frame.h * 0.008;
  translate(copies, jx, jy);
  clampGroup(copies, template, frame, scale);
  return copies;
}

function centerInContent(
  objects: PlacedObject[],
  template: LayoutTemplate,
  frame: { w: number; h: number },
  scale: number,
): void {
  if (objects.length === 0) return;
  const content = contentBox(template, frame);
  const union = unionBox(objects.map((object) => axisBox(object, scale)));
  translate(
    objects,
    content.x + content.w / 2 - (union.x + union.w / 2),
    content.y + content.h / 2 - (union.y + union.h / 2),
  );
}

function placementFits(
  mains: PlacedObject[],
  template: LayoutTemplate,
  scale: number,
  backgrounds: PlacedObject[],
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
  if (
    backgrounds.length > 0 &&
    !backgroundsFit(placed, backgrounds, template, scale)
  ) {
    return false;
  }
  return true;
}

function backgroundsFit(
  mains: PlacedObject[],
  backgrounds: PlacedObject[],
  template: LayoutTemplate,
  scale: number,
): boolean {
  const frame = FORMATS[template.format];
  const placed = placeEdgeBackgrounds(
    backgrounds,
    mains,
    { ...template, scale },
    () => 0.5,
  );
  return placed.every((object) =>
    backgroundReadable(object, scale, frame, mains),
  );
}

/**
 * Center stays inside the frame. The 60% visibility rule keeps a cropped
 * backdrop from becoming a sliver, so the inset can stay small and the
 * object can sit near the edge.
 */
export function centerClear(
  center: { x: number; y: number },
  _size: { w: number; h: number },
  frame: { w: number; h: number },
): boolean {
  const margin = 12;
  return (
    center.x >= margin &&
    center.x <= frame.w - margin &&
    center.y >= margin &&
    center.y <= frame.h - margin
  );
}

export function backgroundReadable(
  object: PlacedObject,
  scale: number,
  frame: { w: number; h: number },
  mains: PlacedObject[],
): boolean {
  const box = axisBox(object, scale);
  if (visibleFraction(box, frame) < MIN_VISIBLE - 1e-6) return false;
  if (!centerClear(object, renderedSize(object, scale), frame)) return false;
  return mains.every(
    (main) => intersection(axisBox(main, scale), box) === null,
  );
}

/**
 * Uniform scale around the group center. `fill` is the share of the frame's
 * limiting side the group should cover (85% at S, 100% at L).
 */
export function scaleMainsToFill(
  mains: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  fill: number,
): number {
  if (mains.length === 0) return scale;
  const union = unionBox(mains.map((object) => axisBox(object, scale)));
  if (union.w < 1 || union.h < 1) return scale;
  const factor = fill * Math.min(frame.w / union.w, frame.h / union.h);
  const cx = union.x + union.w / 2;
  const cy = union.y + union.h / 2;
  for (const object of mains) {
    object.x = cx + (object.x - cx) * factor;
    object.y = cy + (object.y - cy) * factor;
  }
  return scale * factor;
}

/** Moves the scaled group to the template anchor without changing its size. */
export function anchorGroup(
  mains: PlacedObject[],
  template: LayoutTemplate,
  frame: { w: number; h: number },
  scale: number,
): void {
  if (mains.length === 0) return;
  const union = unionBox(mains.map((object) => axisBox(object, scale)));
  let tx = frame.w / 2;
  let ty = frame.h / 2;
  if (template.id === 'under-title') ty = frame.h * 0.7;
  if (template.id === 'offset') {
    tx = frame.w * 0.4;
    ty = frame.h * 0.58;
  }
  translate(mains, tx - (union.x + union.w / 2), ty - (union.y + union.h / 2));
  const next = unionBox(mains.map((object) => axisBox(object, scale)));
  const pad = 4;
  let dx = 0;
  let dy = 0;
  if (next.w <= frame.w - pad * 2) {
    if (next.x < pad) dx = pad - next.x;
    else if (next.x + next.w > frame.w - pad) {
      dx = frame.w - pad - (next.x + next.w);
    }
  }
  if (next.h <= frame.h - pad * 2) {
    if (next.y < pad) dy = pad - next.y;
    else if (next.y + next.h > frame.h - pad) {
      dy = frame.h - pad - (next.y + next.h);
    }
  }
  translate(mains, dx, dy);
}

function axisShift(origin: number, size: number, limit: number): number {
  if (size <= limit) {
    if (origin < 0) return -origin;
    if (origin + size > limit) return limit - (origin + size);
    return 0;
  }
  return (limit - size) / 2 - origin;
}

function allReadable(
  objects: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
): boolean {
  return objects.every((object) => {
    const minimum = object.role === 'background' ? 0.5 : 0.7;
    return visibleFraction(axisBox(object, scale), frame) >= minimum - 1e-6;
  });
}

/**
 * Pulls a scaled scene inside the frame when it fits, and centers the bleed
 * when it does not. Under a title, mains shift down until their centers clear
 * the title band without dropping anyone below the visibility floor.
 */
export function keepReadable(
  objects: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  template?: LayoutTemplate,
): void {
  if (objects.length === 0) return;
  const union = unionBox(objects.map((object) => axisBox(object, scale)));
  translate(
    objects,
    axisShift(union.x, union.w, frame.w),
    axisShift(union.y, union.h, frame.h),
  );
  if (!template?.safeArea) return;
  const mains = objects.filter((object) => object.role === 'main');
  if (mains.length === 0) return;
  const floor = (template.safeArea.y + template.safeArea.h) * frame.h + 1;
  const highest = () => Math.min(...mains.map((object) => object.y));
  if (highest() >= floor) return;
  const needed = floor - highest();
  let low = 0;
  let high = needed;
  let applied = 0;
  for (let step = 0; step < 12; step += 1) {
    const mid = (low + high) / 2;
    translate(objects, 0, mid - applied);
    applied = mid;
    if (allReadable(objects, scale, frame)) low = mid;
    else high = mid;
  }
  translate(objects, 0, low - applied);
}

export function mainGroupFill(
  mains: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
): number {
  if (mains.length === 0) return 0;
  const union = unionBox(mains.map((object) => axisBox(object, scale)));
  return Math.max(union.w / frame.w, union.h / frame.h);
}

/** Largest scale at or below the template scale that keeps the group inside. */
export function fitScale(
  mains: PlacedObject[],
  template: LayoutTemplate,
  backgrounds: PlacedObject[] = [],
): number {
  if (mains.length <= 1) return template.scale;
  if (placementFits(mains, template, template.scale, backgrounds)) {
    return template.scale;
  }
  let low = 0.14;
  let high = template.scale;
  if (!placementFits(mains, template, low, backgrounds)) return low;
  for (let step = 0; step < 18; step += 1) {
    const mid = (low + high) / 2;
    if (placementFits(mains, template, mid, backgrounds)) low = mid;
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

function edgeSpots(
  size: { w: number; h: number },
  frame: { w: number; h: number },
): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  const stepX = Math.max(16, frame.w / 40);
  const stepY = Math.max(16, frame.h / 36);
  const minX = -size.w * 0.42;
  const maxX = frame.w + size.w * 0.42;
  const minY = -size.h * 0.42;
  const maxY = frame.h + size.h * 0.42;
  for (let x = minX; x <= maxX; x += stepX) {
    for (let y = minY; y <= maxY; y += stepY) {
      spots.push({ x, y });
    }
  }
  spots.push(
    { x: frame.w / 2, y: frame.h / 2 },
    { x: size.w * 0.42, y: frame.h / 2 },
    { x: frame.w - size.w * 0.42, y: frame.h / 2 },
    { x: frame.w / 2, y: size.h * 0.42 },
    { x: frame.w / 2, y: frame.h - size.h * 0.42 },
  );
  return spots;
}

/**
 * Sits backgrounds on an isometric diagonal around the mains, before the
 * scene is scaled. A tall frame stacks depth vertically. A wide frame
 * steps it sideways. Side objects never overlap the group.
 */
export function seatBackgrounds(
  backgrounds: PlacedObject[],
  mains: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  aspect: number,
): PlacedObject[] {
  if (backgrounds.length === 0 || mains.length === 0) {
    return backgrounds.map(clone);
  }
  const copies = backgrounds.map(clone);
  const ordered = [...copies].sort(
    (left, right) => areaOf(right, scale) - areaOf(left, scale),
  );
  const occupied = mains.map((object) => axisBox(object, scale));
  const anchor = unionBox(occupied);
  const peers: number[] = [];
  const gap = Math.max(GAP, Math.min(frame.w, frame.h) * 0.008);
  const maxAway = Math.min(frame.w, frame.h) * 0.1;
  for (const object of ordered) {
    const spot = chooseSpot(
      object,
      occupied,
      scale,
      gap,
      aspect,
      peers,
      frame.h * 0.22,
      anchor,
      maxAway,
    );
    object.x = spot.x;
    object.y = spot.y;
    object.rotation = 0;
    occupied.push(boxAt(spot, renderedSize(object, scale)));
    peers.push(spot.y);
  }
  return copies;
}

/**
 * Sits each background beside the main group (or just behind it) with a
 * small gap. Side objects — lamp, vase, headphones — only stand beside.
 * The caller scales the whole scene afterwards, so these positions are
 * relative to the mains, not to the frame corners.
 */
export function placeNearGroup(
  backgrounds: PlacedObject[],
  mains: PlacedObject[],
  scale: number,
): PlacedObject[] {
  if (mains.length === 0) return backgrounds.map(clone);
  const copies = backgrounds.map(clone);
  const ordered = [...copies].sort(
    (left, right) => areaOf(right, scale) - areaOf(left, scale),
  );
  const occupied = mains.map((object) => axisBox(object, scale));
  let prefer: 'left' | 'right' = 'right';
  for (const object of ordered) {
    const size = renderedSize(object, scale);
    const union = unionBox(occupied);
    const gap = Math.max(GAP, Math.min(union.w, union.h) * 0.04);
    const besideOnly = profile(object.objectId).anchor === 'side';
    const spot = pickNearSpot(size, union, occupied, gap, besideOnly, prefer);
    object.x = spot.x;
    object.y = spot.y;
    object.rotation = 0;
    occupied.push({
      x: spot.x - size.w / 2,
      y: spot.y - size.h / 2,
      w: size.w,
      h: size.h,
    });
    prefer = prefer === 'right' ? 'left' : 'right';
  }
  return copies;
}

function pickNearSpot(
  size: { w: number; h: number },
  union: Box,
  occupied: Box[],
  gap: number,
  besideOnly: boolean,
  prefer: 'left' | 'right',
): { x: number; y: number } {
  for (const spot of besideSpots(size, union, gap, besideOnly, prefer)) {
    const box = {
      x: spot.x - size.w / 2,
      y: spot.y - size.h / 2,
      w: size.w,
      h: size.h,
    };
    if (!overlaps(box, occupied, 2)) return spot;
  }
  const step = Math.max(12, Math.min(size.w, size.h) * 0.1);
  let best: { x: number; y: number; score: number } | null = null;
  const minX = union.x - size.w - gap * 3;
  const maxX = union.x + union.w + size.w + gap * 3;
  const minY = union.y - size.h - gap * 2;
  const maxY = union.y + union.h + size.h * 0.15;
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      const box = {
        x: x - size.w / 2,
        y: y - size.h / 2,
        w: size.w,
        h: size.h,
      };
      if (overlaps(box, occupied, 2)) continue;
      if (besideOnly && coversGroup(box, union)) continue;
      const dx = Math.max(
        union.x - (box.x + box.w),
        box.x - (union.x + union.w),
        0,
      );
      const dy = Math.max(
        union.y - (box.y + box.h),
        box.y - (union.y + union.h),
        0,
      );
      const ground = Math.abs(box.y + box.h - (union.y + union.h));
      const score = Math.hypot(dx, dy) + ground * 0.35;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  if (best) return best;
  return {
    x: union.x + union.w + gap + size.w / 2,
    y: union.y + union.h - size.h / 2,
  };
}

function coversGroup(box: Box, union: Box): boolean {
  const overlap =
    Math.min(box.x + box.w, union.x + union.w) - Math.max(box.x, union.x);
  return overlap > box.w * 0.25;
}

function besideSpots(
  size: { w: number; h: number },
  union: Box,
  gap: number,
  besideOnly: boolean,
  prefer: 'left' | 'right',
): { x: number; y: number }[] {
  const yGround = union.y + union.h - size.h / 2;
  const step = Math.max(gap, Math.min(size.w, size.h) * 0.08);
  const spots: { x: number; y: number }[] = [];
  for (let ring = 0; ring < 4; ring += 1) {
    const lift = ring * step * 0.35;
    const right = {
      x: union.x + union.w + gap + ring * step + size.w / 2,
      y: yGround - lift,
    };
    const left = {
      x: union.x - gap - ring * step - size.w / 2,
      y: yGround - lift,
    };
    if (prefer === 'right') spots.push(right, left);
    else spots.push(left, right);
  }
  if (!besideOnly) {
    spots.push({
      x: union.x + union.w / 2,
      y: union.y - gap - size.h / 2,
    });
  }
  return spots;
}

/**
 * Parks monochrome objects behind the mains. Most of each object stays
 * inside the frame; a light crop at the edge is preferred.
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
    (left, right) => areaOf(right, scale) - areaOf(left, scale),
  );
  const occupied: Box[] = [];
  for (const object of ordered) {
    const size = renderedSize(object, scale);
    let best: { x: number; y: number; score: number } | null = null;
    let fallback: { x: number; y: number; score: number } | null = null;
    for (const spot of edgeSpots(size, frame)) {
      const box = {
        x: spot.x - size.w / 2,
        y: spot.y - size.h / 2,
        w: size.w,
        h: size.h,
      };
      if (overlaps(box, mainBoxes, 6)) continue;
      if (overlaps(box, occupied, 6)) continue;
      const visible = visibleFraction(box, frame);
      const lightCrop =
        visible >= MIN_VISIBLE && visible <= 0.9 && crossesFrame(box, frame)
          ? 0.04
          : 0;
      const fromCenter = Math.hypot(spot.x - frame.w / 2, spot.y - frame.h / 2);
      const edge = Math.min(
        1,
        fromCenter / Math.hypot(frame.w / 2, frame.h / 2),
      );
      const score = edge + visible * 0.35 + lightCrop;
      if (!fallback || visible > fallback.score) {
        fallback = { ...spot, score: visible };
      }
      if (visible < MIN_VISIBLE) continue;
      if (!centerClear(spot, size, frame)) continue;
      if (!best || score > best.score) best = { ...spot, score };
    }
    const chosen = best ??
      fallback ?? { x: frame.w / 2, y: frame.h / 2, score: 0 };
    const jx = (random() * 2 - 1) * frame.w * 0.004;
    const jy = (random() * 2 - 1) * frame.h * 0.004;
    object.x = chosen.x + jx;
    object.y = chosen.y + jy;
    object.rotation = 0;
    let box = axisBox(object, scale);
    if (
      overlaps(box, mainBoxes, 2) ||
      overlaps(box, occupied, 2) ||
      visibleFraction(box, frame) < MIN_VISIBLE ||
      !centerClear(object, size, frame)
    ) {
      object.x = chosen.x;
      object.y = chosen.y;
      box = axisBox(object, scale);
    }
    occupied.push(box);
  }
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
