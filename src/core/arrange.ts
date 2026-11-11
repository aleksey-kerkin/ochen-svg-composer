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
import { canRest, faceOf, profile } from './profiles.ts';

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
function contentBox(
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
function groupAspect(
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

function byDescendingArea(
  objects: PlacedObject[],
  scale: number,
): PlacedObject[] {
  return [...objects].sort(
    (left, right) => areaOf(right, scale) - areaOf(left, scale),
  );
}

function titleFloor(
  template: LayoutTemplate,
  frame: { w: number; h: number },
): number {
  if (!template.safeArea) return Number.NEGATIVE_INFINITY;
  return (template.safeArea.y + template.safeArea.h) * frame.h + 1;
}

function mainsAboveFloor(objects: PlacedObject[], floor: number): boolean {
  return objects.some((object) => object.role === 'main' && object.y < floor);
}

function rememberPositions(objects: PlacedObject[]): () => void {
  const saved = new Map(
    objects.map((object) => [object, { x: object.x, y: object.y }]),
  );
  return () => {
    for (const [object, previous] of saved) {
      object.x = previous.x;
      object.y = previous.y;
    }
  };
}

function capturePositions(objects: PlacedObject[]): {
  start: { object: PlacedObject; x: number; y: number }[];
  restore: () => void;
} {
  const start = objects.map((object) => ({
    object,
    x: object.x,
    y: object.y,
  }));
  return {
    start,
    restore: () => {
      for (const item of start) {
        item.object.x = item.x;
        item.object.y = item.y;
      }
    },
  };
}

function riderRests(a: PlacedObject, b: PlacedObject, scale: number): boolean {
  const rider = canRest(a.objectId, b.objectId)
    ? a
    : canRest(b.objectId, a.objectId)
      ? b
      : undefined;
  const support = rider === a ? b : rider === b ? a : undefined;
  if (!rider || !support) return false;
  return contains(
    faceOf(support.objectId, axisBox(support, scale)),
    axisBox(rider, scale),
  );
}

function leadClearance(
  lead: PlacedObject,
  hitters: PlacedObject[],
  gapSources: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
): { visible: number; hits: boolean; gap: number } {
  const box = axisBox(lead, scale);
  return {
    visible: visibleFraction(box, frame),
    hits: hitters.some(
      (object) => intersection(box, axisBox(object, scale)) !== null,
    ),
    gap: gapBetween(
      box,
      unionBox(gapSources.map((object) => axisBox(object, scale))),
    ),
  };
}

function diagonalWeight(spot: { x: number; y: number }, union: Box): number {
  const above = spot.y < union.y + union.h * 0.35;
  const below = spot.y > union.y + union.h * 0.65;
  const right = spot.x > union.x + union.w / 2;
  const left = spot.x < union.x + union.w / 2;
  return (above && right) || (below && left) ? 0.78 : 1;
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
      const away = anchor ? gapBetween(box, anchor) : 0;
      const score = error * diagonalWeight(spot, union) + away / 4000;
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

/**
 * Center stays inside the frame. The 60% visibility rule keeps a cropped
 * backdrop from becoming a sliver, so the inset can stay small and the
 * object can sit near the edge.
 */
function centerClear(
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

export function mainGroupFill(
  mains: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
): number {
  if (mains.length === 0) return 0;
  const union = unionBox(mains.map((object) => axisBox(object, scale)));
  return Math.max(union.w / frame.w, union.h / frame.h);
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
 * Parks monochrome objects behind the mains. Most of each object stays
 * inside the frame; a light crop at the edge is preferred.
 */
function chooseEdgeSpot(
  size: { w: number; h: number },
  frame: { w: number; h: number },
  mainBoxes: Box[],
  occupied: Box[],
): { x: number; y: number } {
  let best: { x: number; y: number; score: number } | null = null;
  let fallback: { x: number; y: number; score: number } | null = null;
  for (const spot of edgeSpots(size, frame)) {
    const box = {
      x: spot.x - size.w / 2,
      y: spot.y - size.h / 2,
      w: size.w,
      h: size.h,
    };
    if (overlaps(box, mainBoxes, 6) || overlaps(box, occupied, 6)) continue;
    const visible = visibleFraction(box, frame);
    const lightCrop =
      visible >= MIN_VISIBLE && visible <= 0.9 && crossesFrame(box, frame)
        ? 0.04
        : 0;
    const fromCenter = Math.hypot(spot.x - frame.w / 2, spot.y - frame.h / 2);
    const edge = Math.min(1, fromCenter / Math.hypot(frame.w / 2, frame.h / 2));
    const score = edge + visible * 0.35 + lightCrop;
    if (!fallback || visible > fallback.score) {
      fallback = { ...spot, score: visible };
    }
    if (visible < MIN_VISIBLE || !centerClear(spot, size, frame)) continue;
    if (!best || score > best.score) best = { ...spot, score };
  }
  return best ?? fallback ?? { x: frame.w / 2, y: frame.h / 2 };
}

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
  const ordered = byDescendingArea(copies, scale);
  const occupied: Box[] = [];
  for (const object of ordered) {
    const size = renderedSize(object, scale);
    const chosen = chooseEdgeSpot(size, frame, mainBoxes, occupied);
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

type CropSide = 'left' | 'right' | 'above' | 'below';

const HERO_MIN = 0.7;
const CROP_TARGET = 0.5;

function scaleAbout(
  object: PlacedObject,
  origin: { x: number; y: number },
  factor: number,
): void {
  object.x = origin.x + (object.x - origin.x) * factor;
  object.y = origin.y + (object.y - origin.y) * factor;
}

function sideFor(template: LayoutTemplate, index: number): CropSide {
  const wide =
    template.format === 'landscape' ||
    (template.id === 'under-title' && template.format === 'square');
  if (wide) return index === 0 ? 'left' : 'right';
  return 'below';
}

function flushCenter(
  side: CropSide,
  union: Box,
  size: { w: number; h: number },
  gap: number,
): { x: number; y: number } {
  const midX = union.x + union.w / 2;
  const midY = union.y + union.h / 2;
  if (side === 'left') {
    return { x: union.x - gap - size.w / 2, y: midY };
  }
  if (side === 'right') {
    return { x: union.x + union.w + gap + size.w / 2, y: midY };
  }
  if (side === 'above') {
    return { x: midX, y: union.y - gap - size.h / 2 };
  }
  return { x: midX, y: union.y + union.h + gap + size.h / 2 };
}

/** Nudges along the shared edge so the pair reads as a diagonal, still touching. */
function stagger(
  side: CropSide,
  union: Box,
  size: { w: number; h: number },
  center: { x: number; y: number },
): { x: number; y: number } {
  if (side === 'left' || side === 'right') {
    const limit = (union.h + size.h) / 2 - Math.min(union.h, size.h) * 0.35;
    const dy = (side === 'left' ? 1 : -1) * Math.max(0, limit) * 0.5;
    return { x: center.x, y: center.y + dy };
  }
  const limit = (union.w + size.w) / 2 - Math.min(union.w, size.w) * 0.35;
  const dx = (side === 'below' ? -1 : 1) * Math.max(0, limit) * 0.5;
  return { x: center.x + dx, y: center.y };
}

const SIDES: CropSide[] = ['left', 'right', 'below', 'above'];

function heroFactor(
  hero: PlacedObject,
  fromScale: number,
  frame: { w: number; h: number },
  target: number,
): number {
  const box = axisBox(hero, fromScale);
  if (box.w < 1 || box.h < 1) return 1;
  return target * Math.min(frame.w / box.w, frame.h / box.h);
}

function parkHero(
  cluster: PlacedObject[],
  hero: PlacedObject,
  scale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
): void {
  const box = axisBox(hero, scale);
  let tx = frame.w / 2;
  let ty = frame.h / 2;
  if (template.id === 'under-title') ty = frame.h * 0.62;
  if (template.id === 'offset') {
    tx = frame.w * 0.4;
    ty = frame.h * 0.58;
  }
  translate(cluster, tx - (box.x + box.w / 2), ty - (box.y + box.h / 2));
  if (!template.safeArea) return;
  const floor = (template.safeArea.y + template.safeArea.h) * frame.h + 1;
  const highest = Math.min(...cluster.map((object) => object.y));
  if (highest >= floor) return;
  translate(cluster, 0, floor - highest);
  if (visibleFraction(axisBox(hero, scale), frame) >= HERO_MIN - 1e-3) {
    return;
  }
  translate(cluster, 0, highest - floor);
}

function glueLead(
  lead: PlacedObject,
  riders: PlacedObject[],
  blockers: PlacedObject[],
  scale: number,
  side: CropSide,
): void {
  const size = renderedSize(lead, scale);
  const union = unionBox(blockers.map((object) => axisBox(object, scale)));
  const spot = stagger(side, union, size, flushCenter(side, union, size, GAP));
  const dx = spot.x - lead.x;
  const dy = spot.y - lead.y;
  lead.x = spot.x;
  lead.y = spot.y;
  lead.rotation = 0;
  translate(riders, dx, dy);
}

/** Slides the hero and the companion together until the companion is about half in frame. */
function outwardSlide(
  box: Box,
  frame: { w: number; h: number },
): { horizontal: boolean; sign: number } {
  const overflowLeft = Math.max(0, -box.x);
  const overflowRight = Math.max(0, box.x + box.w - frame.w);
  const overflowTop = Math.max(0, -box.y);
  const overflowBottom = Math.max(0, box.y + box.h - frame.h);
  const horizontal =
    overflowLeft + overflowRight >= overflowTop + overflowBottom;
  const outward = horizontal
    ? overflowRight >= overflowLeft
      ? 1
      : -1
    : overflowBottom >= overflowTop
      ? 1
      : -1;
  const sign = visibleFraction(box, frame) < CROP_TARGET ? -outward : outward;
  return { horizontal, sign };
}

function stepClearsBand(
  hero: PlacedObject,
  moving: PlacedObject[],
  guards: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  floor: number,
): boolean {
  if (visibleFraction(axisBox(hero, scale), frame) < HERO_MIN - 1e-3) {
    return false;
  }
  if (mainsAboveFloor(moving, floor)) return false;
  return guards.every((object) =>
    showsEnough(object, visibleFraction(axisBox(object, scale), frame)),
  );
}

function pullIntoBand(
  lead: PlacedObject,
  moving: PlacedObject[],
  hero: PlacedObject,
  guards: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
): boolean {
  const { start, restore } = capturePositions(moving);
  const { horizontal, sign } = outwardSlide(axisBox(lead, scale), frame);
  const floor = titleFloor(template, frame);
  let best: number | null = null;
  for (let step = 0; step <= 120; step += 1) {
    const delta = sign * step * 4;
    shiftCaptured(start, horizontal, delta);
    if (!stepClearsBand(hero, moving, guards, scale, frame, floor)) continue;
    const value = visibleFraction(axisBox(lead, scale), frame);
    if (!inBand(value)) continue;
    if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
  }
  if (best === null) {
    restore();
    return false;
  }
  shiftCaptured(start, horizontal, best);
  return true;
}

function shiftCaptured(
  start: { object: PlacedObject; x: number; y: number }[],
  horizontal: boolean,
  delta: number,
): void {
  for (const item of start) {
    item.object.x = item.x + (horizontal ? delta : 0);
    item.object.y = item.y + (horizontal ? 0 : delta);
  }
}

function inBand(value: number): boolean {
  return value >= 0.38 && value <= 0.62;
}

/** Backgrounds stay half in frame. A named main may show more, but not a sliver. */
function showsEnough(object: PlacedObject, value: number): boolean {
  if (object.role === 'background') return inBand(value);
  return value >= 0.38;
}

function restsClean(objects: PlacedObject[], scale: number): boolean {
  const mains = objects.filter((object) => object.role === 'main');
  for (let left = 0; left < mains.length; left += 1) {
    for (let right = left + 1; right < mains.length; right += 1) {
      const a = mains[left];
      const b = mains[right];
      if (!a || !b) continue;
      if (!intersection(axisBox(a, scale), axisBox(b, scale))) continue;
      if (!riderRests(a, b, scale)) return false;
    }
  }
  return true;
}

function problemCount(
  objects: PlacedObject[],
  scale: number,
  template: LayoutTemplate,
): number {
  const frame = FORMATS[template.format];
  const floor = template.safeArea
    ? (template.safeArea.y + template.safeArea.h) * frame.h - 1
    : Number.NEGATIVE_INFINITY;
  let problems = 0;
  for (const object of objects) {
    if (object.role !== 'main') continue;
    if (object.y < floor) problems += 1;
    if (visibleFraction(axisBox(object, scale), frame) < 0.38) problems += 1;
  }
  if (!restsClean(objects, scale)) problems += 1;
  return problems;
}

/**
 * Hero first: its box covers `target` of the frame's limiting side. Up to one
 * companion on a square or portrait, and two on landscape, sit tight against
 * that hero and are cropped to about half. Every named main stays. A crowded
 * frame steps the hero down, still inside the allowed band, until the mains fit.
 */
export function frameCloseUp(
  mains: PlacedObject[],
  backgrounds: PlacedObject[],
  template: LayoutTemplate,
  fromScale: number,
  target: number,
): { scale: number; objects: PlacedObject[] } {
  const floor = target - 0.18;
  let chosen: { scale: number; objects: PlacedObject[] } | null = null;
  let chosenProblems = Number.POSITIVE_INFINITY;
  for (let attempt = target; attempt >= floor - 1e-9; attempt -= 0.02) {
    const result = closeUpOnce(
      mains.map((object) => ({ ...object })),
      backgrounds.map((object) => ({ ...object })),
      template,
      fromScale,
      attempt,
    );
    const problems = problemCount(result.objects, result.scale, template);
    if (
      problems < chosenProblems ||
      (problems === chosenProblems && chosen === null)
    ) {
      chosen = result;
      chosenProblems = problems;
    }
    if (problems === 0) return result;
  }
  return chosen ?? closeUpOnce(mains, backgrounds, template, fromScale, target);
}

interface CloseUpPrep {
  hero: PlacedObject;
  riders: PlacedObject[];
  ridersOf: (support: PlacedObject) => PlacedObject[];
  independents: PlacedObject[];
  scale: number;
  cluster: PlacedObject[];
}

function prepareCloseUp(
  mains: PlacedObject[],
  template: LayoutTemplate,
  fromScale: number,
  target: number,
  frame: { w: number; h: number },
): CloseUpPrep {
  const hero = mains.reduce((best, object) =>
    areaOf(object, fromScale) > areaOf(best, fromScale) ? object : best,
  );
  const ridersOf = (support: PlacedObject) => riderSnapshot.get(support) ?? [];
  const riderSnapshot = new Map<PlacedObject, PlacedObject[]>(
    mains.map((support) => [
      support,
      mains.filter(
        (object) => object !== support && restsOn(object, support, fromScale),
      ),
    ]),
  );
  const riders = ridersOf(hero);
  const independents = mains.filter(
    (object) =>
      object !== hero &&
      !riders.includes(object) &&
      !mains.some(
        (support) => support !== hero && restsOn(object, support, fromScale),
      ),
  );
  const slots = template.format === 'landscape' ? 2 : 1;
  const factor = heroFactor(hero, fromScale, frame, target);
  const scale = fromScale * factor;
  const cluster = [hero, ...riders];
  const origin = { x: hero.x, y: hero.y };
  const crowdBefore = independents.length > slots;
  if (crowdBefore) {
    for (const object of mains) scaleAbout(object, origin, factor);
  } else {
    for (const object of cluster) scaleAbout(object, origin, factor);
    for (const independent of independents) {
      const around = { x: independent.x, y: independent.y };
      for (const rider of ridersOf(independent)) {
        scaleAbout(rider, around, factor);
      }
    }
  }
  parkHero(crowdBefore ? mains : cluster, hero, scale, frame, template);
  return { hero, riders, ridersOf, independents, scale, cluster };
}

function attachIndependents(
  independents: PlacedObject[],
  hero: PlacedObject,
  mains: PlacedObject[],
  fromScale: number,
  scale: number,
): Map<PlacedObject, PlacedObject> {
  const attached = new Map<PlacedObject, PlacedObject>();
  for (const object of independents) {
    const support = [hero, ...independents].find(
      (candidate) =>
        candidate !== object &&
        !attached.has(candidate) &&
        canRest(object.objectId, candidate.objectId) &&
        areaOf(candidate, fromScale) >= areaOf(object, fromScale),
    );
    if (!support) continue;
    const face = faceOf(support.objectId, axisBox(support, scale));
    object.rotation = 0;
    object.x = face.x + face.w / 2;
    object.y = face.y + face.h / 2;
    if (!restsOn(object, support, scale)) continue;
    const box = axisBox(object, scale);
    const blocked = mains.filter(
      (other) => other !== object && other !== support,
    );
    if (
      blocked.some((other) => intersection(box, axisBox(other, scale)) !== null)
    ) {
      continue;
    }
    attached.set(object, support);
  }
  return attached;
}

function omitLead(
  lead: PlacedObject,
  attached: Map<PlacedObject, PlacedObject>,
  omitted: Set<PlacedObject>,
): void {
  if (lead.role !== 'main') return;
  omitted.add(lead);
  for (const [rider, support] of attached) {
    if (support === lead) omitted.add(rider);
  }
}

function trySeatLead(
  lead: PlacedObject,
  followers: PlacedObject[],
  blockers: PlacedObject[],
  hero: PlacedObject,
  ridersOf: (support: PlacedObject) => PlacedObject[],
  placed: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
): boolean {
  const moving = [...blockers, lead, ...followers];
  const restore = rememberPositions(moving);
  const prefer = sideFor(template, placed.length);
  const sides = [prefer, ...SIDES.filter((side) => side !== prefer)];
  for (const side of sides) {
    restore();
    glueLead(lead, followers, blockers, scale, side);
    trimToBand(lead, blockers, followers, scale, frame);
    dropBelowTitle(lead, blockers, followers, scale, template);
    if (!showsEnough(lead, visibleFraction(axisBox(lead, scale), frame))) {
      pullIntoBand(
        lead,
        moving,
        hero,
        placed.flatMap((object) => [
          object,
          ...(object.role === 'main' ? ridersOf(object) : []),
        ]),
        scale,
        frame,
        template,
      );
    }
    const { visible, hits, gap } = leadClearance(
      lead,
      blockers,
      blockers,
      scale,
      frame,
    );
    const titled = mainsAboveFloor(
      [lead, ...followers],
      titleFloor(template, frame),
    );
    if (!hits && gap <= 18 && showsEnough(lead, visible) && !titled) {
      return true;
    }
  }
  if (
    lead.role === 'main' &&
    placeLoose(lead, followers, blockers, scale, frame, template)
  ) {
    return true;
  }
  restore();
  return false;
}

function seatCompanions(
  prep: CloseUpPrep,
  attached: Map<PlacedObject, PlacedObject>,
  backgrounds: PlacedObject[],
  fromScale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
  slots: number,
): {
  placed: PlacedObject[];
  omitted: Set<PlacedObject>;
  crowd: boolean;
} {
  const { hero, riders, ridersOf, independents, scale, cluster } = prep;
  const free = independents.filter((object) => !attached.has(object));
  const crowd = free.length > 2 && free.length > slots;
  const followersOf = (support: PlacedObject) => [
    ...ridersOf(support),
    ...[...attached.entries()]
      .filter(([, candidate]) => candidate === support)
      .map(([rider]) => rider),
  ];

  const placed: PlacedObject[] = [];
  const omitted = new Set<PlacedObject>();
  const parked = new Set<PlacedObject>([
    ...cluster,
    ...[...attached.keys()].filter((rider) => !free.includes(rider)),
  ]);
  const queue: PlacedObject[] = crowd
    ? []
    : [
        ...byDescendingArea(free, fromScale),
        ...byDescendingArea(backgrounds, fromScale),
      ];
  for (const lead of queue) {
    seatQueuedLead(
      lead,
      placed,
      parked,
      omitted,
      attached,
      followersOf,
      hero,
      riders,
      ridersOf,
      slots,
      scale,
      frame,
      template,
    );
  }
  return { placed, omitted, crowd };
}

function seatQueuedLead(
  lead: PlacedObject,
  placed: PlacedObject[],
  parked: Set<PlacedObject>,
  omitted: Set<PlacedObject>,
  attached: Map<PlacedObject, PlacedObject>,
  followersOf: (support: PlacedObject) => PlacedObject[],
  hero: PlacedObject,
  riders: PlacedObject[],
  ridersOf: (support: PlacedObject) => PlacedObject[],
  slots: number,
  scale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
): void {
  if (placed.length >= slots) {
    omitLead(lead, attached, omitted);
    return;
  }
  const followers = lead.role === 'main' ? followersOf(lead) : [];
  const blockers = [...parked];
  if (
    !trySeatLead(
      lead,
      followers,
      blockers,
      hero,
      ridersOf,
      placed,
      scale,
      frame,
      template,
    )
  ) {
    omitLead(lead, attached, omitted);
    return;
  }
  parked.add(lead);
  for (const rider of followers) parked.add(rider);
  const heroCluster = [hero, ...riders];
  for (const earlier of placed) {
    reseatCompanion(
      earlier,
      earlier.role === 'main' ? followersOf(earlier) : [],
      heroCluster,
      [lead, ...followers, ...placed.filter((object) => object !== earlier)],
      scale,
      frame,
      template,
    );
  }
  placed.push(lead);
}

function seatCrowdBackgrounds(
  backgrounds: PlacedObject[],
  mains: PlacedObject[],
  placed: PlacedObject[],
  fromScale: number,
  scale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
  slots: number,
): void {
  for (const lead of byDescendingArea(backgrounds, fromScale)) {
    if (placed.length >= slots) break;
    const prefer = sideFor(template, placed.length);
    const sides = [prefer, ...SIDES.filter((side) => side !== prefer)];
    let fitted = false;
    for (const side of sides) {
      glueLead(lead, [], mains, scale, side);
      trimToBand(lead, mains, [], scale, frame);
      const { visible, hits, gap } = leadClearance(
        lead,
        mains,
        mains,
        scale,
        frame,
      );
      if (!hits && gap <= 14 && inBand(visible)) {
        fitted = true;
        break;
      }
    }
    if (fitted) placed.push(lead);
  }
}

function finishCloseUp(
  mains: PlacedObject[],
  placed: PlacedObject[],
  omitted: Set<PlacedObject>,
  scale: number,
  frame: { w: number; h: number },
): { scale: number; objects: PlacedObject[] } {
  const keptMains = mains.filter((object) => !omitted.has(object));
  for (const rider of keptMains) {
    const support = keptMains.find(
      (other) => other !== rider && restsOn(rider, other, scale),
    );
    if (support) settleRider(rider, support, scale, frame);
  }
  const keptBackgrounds = placed.filter((object) => {
    if (object.role !== 'background') return false;
    const box = axisBox(object, scale);
    return !keptMains.some(
      (main) => intersection(box, axisBox(main, scale)) !== null,
    );
  });
  return {
    scale,
    objects: orderByDepth(keptBackgrounds, keptMains, scale),
  };
}

function closeUpOnce(
  mains: PlacedObject[],
  backgrounds: PlacedObject[],
  template: LayoutTemplate,
  fromScale: number,
  target: number,
): { scale: number; objects: PlacedObject[] } {
  const frame = FORMATS[template.format];
  const prep = prepareCloseUp(mains, template, fromScale, target, frame);
  const attached = attachIndependents(
    prep.independents,
    prep.hero,
    mains,
    fromScale,
    prep.scale,
  );
  const slots = template.format === 'landscape' ? 2 : 1;
  const seated = seatCompanions(
    prep,
    attached,
    backgrounds,
    fromScale,
    frame,
    template,
    slots,
  );
  if (seated.crowd) {
    seatCrowdBackgrounds(
      backgrounds,
      mains,
      seated.placed,
      fromScale,
      prep.scale,
      frame,
      template,
      slots,
    );
  }
  return finishCloseUp(mains, seated.placed, seated.omitted, prep.scale, frame);
}

/** Slides a rider inside its support face toward the part that is on screen. */
function settleRider(
  rider: PlacedObject,
  support: PlacedObject,
  scale: number,
  frame: { w: number; h: number },
): void {
  const face = faceOf(support.objectId, axisBox(support, scale));
  const size = renderedSize(rider, scale);
  const minX = face.x + size.w / 2;
  const maxX = face.x + face.w - size.w / 2;
  const minY = face.y + size.h / 2;
  const maxY = face.y + face.h - size.h / 2;
  if (minX > maxX || minY > maxY) return;
  let bestX = rider.x;
  let bestY = rider.y;
  let bestVis = visibleFraction(axisBox(rider, scale), frame);
  for (let x = minX; x <= maxX; x += 10) {
    for (let y = minY; y <= maxY; y += 10) {
      rider.x = x;
      rider.y = y;
      const value = visibleFraction(axisBox(rider, scale), frame);
      if (value > bestVis) {
        bestVis = value;
        bestX = x;
        bestY = y;
      }
    }
  }
  rider.x = bestX;
  rider.y = bestY;
}

/** Puts a companion back on the hero after a later companion shifted the group. */
function reseatCompanion(
  lead: PlacedObject,
  followers: PlacedObject[],
  heroCluster: PlacedObject[],
  others: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
): void {
  const restore = rememberPositions([lead, ...followers]);
  const floor = titleFloor(template, frame);
  const prefer = sideFor(template, 0);
  const sides = [prefer, ...SIDES.filter((side) => side !== prefer)];
  for (const side of sides) {
    restore();
    glueLead(lead, followers, heroCluster, scale, side);
    const blockers = [...heroCluster, ...others];
    trimToBand(lead, blockers, followers, scale, frame);
    dropBelowTitle(lead, blockers, followers, scale, template);
    const { visible, hits, gap } = leadClearance(
      lead,
      blockers,
      heroCluster,
      scale,
      frame,
    );
    const titled =
      lead.role === 'main' && mainsAboveFloor([lead, ...followers], floor);
    if (!hits && gap <= 18 && inBand(visible) && !titled) return;
  }
  restore();
}

interface LooseSpot {
  x: number;
  y: number;
  gap: number;
  riders: { x: number; y: number }[];
}

function readableLooseSpot(
  lead: PlacedObject,
  followers: PlacedObject[],
  blockers: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  floor: number,
): LooseSpot | null {
  if (mainsAboveFloor([lead, ...followers], floor)) return null;
  const { visible, hits, gap } = leadClearance(
    lead,
    blockers,
    blockers,
    scale,
    frame,
  );
  if (hits || visible < 0.38) return null;
  return {
    x: lead.x,
    y: lead.y,
    gap,
    riders: followers.map((object) => ({ x: object.x, y: object.y })),
  };
}

function searchLoose(
  lead: PlacedObject,
  followers: PlacedObject[],
  blockers: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  floor: number,
  restore: () => void,
): LooseSpot | null {
  let best: LooseSpot | null = null;
  for (const side of SIDES) {
    restore();
    glueLead(lead, followers, blockers, scale, side);
    const anchor = followers.map((object) => ({
      dx: object.x - lead.x,
      dy: object.y - lead.y,
    }));
    const sx = lead.x;
    const sy = lead.y;
    const horizontal = side === 'left' || side === 'right';
    const outward = side === 'left' || side === 'above' ? -1 : 1;
    const limit = Math.max(frame.w, frame.h);
    for (let along = -limit; along <= limit; along += 16) {
      for (let out = 0; out <= limit; out += 16) {
        lead.x = sx + (horizontal ? outward * out : along);
        lead.y = sy + (horizontal ? along : outward * out);
        followers.forEach((object, index) => {
          const shift = anchor[index];
          if (!shift) return;
          object.x = lead.x + shift.dx;
          object.y = lead.y + shift.dy;
        });
        const spot = readableLooseSpot(
          lead,
          followers,
          blockers,
          scale,
          frame,
          floor,
        );
        if (spot && (!best || spot.gap < best.gap)) best = spot;
      }
    }
  }
  return best;
}

/** Last resort: any non-overlapping spot that keeps a named main readable. */
function placeLoose(
  lead: PlacedObject,
  followers: PlacedObject[],
  blockers: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
  template: LayoutTemplate,
): boolean {
  const restore = rememberPositions([lead, ...followers]);
  const best = searchLoose(
    lead,
    followers,
    blockers,
    scale,
    frame,
    titleFloor(template, frame),
    restore,
  );
  if (!best) {
    restore();
    return false;
  }
  lead.x = best.x;
  lead.y = best.y;
  followers.forEach((object, index) => {
    const spot = best.riders[index];
    if (!spot) return;
    object.x = spot.x;
    object.y = spot.y;
  });
  return true;
}

/** Slides a companion down along the contact until its center clears the title. */
function dropBelowTitle(
  lead: PlacedObject,
  blockers: PlacedObject[],
  followers: PlacedObject[],
  scale: number,
  template: LayoutTemplate,
): void {
  if (!template.safeArea || lead.role !== 'main') return;
  const frame = FORMATS[template.format];
  const floor = titleFloor(template, frame);
  if (lead.y >= floor) return;
  const union = unionBox(blockers.map((object) => axisBox(object, scale)));
  const startY = lead.y;
  let best = 0;
  for (let offset = 0; offset <= frame.h; offset += 2) {
    lead.y = startY + offset;
    if (contactBroken(lead, blockers, union, scale, 18)) continue;
    if (lead.y >= floor) {
      best = offset;
      break;
    }
  }
  const shift = best;
  lead.y = startY + shift;
  for (const rider of followers) rider.y += shift;
}

/** True when the lead overlaps a blocker or drifts off the contact band. */
function contactBroken(
  lead: PlacedObject,
  blockers: PlacedObject[],
  union: Box,
  scale: number,
  maxGap: number,
): boolean {
  const box = axisBox(lead, scale);
  const hits = blockers.some(
    (object) => intersection(box, axisBox(object, scale)) !== null,
  );
  return hits || gapBetween(box, union) > maxGap;
}

function bandSlideScore(
  lead: PlacedObject,
  blockers: PlacedObject[],
  union: Box,
  scale: number,
  frame: { w: number; h: number },
): number {
  const box = axisBox(lead, scale);
  if (contactBroken(lead, blockers, union, scale, 14)) {
    return Number.POSITIVE_INFINITY;
  }
  const value = visibleFraction(box, frame);
  const outside = value >= 0.4 && value <= 0.6 ? 0 : value < 0.38 ? 2 : 1;
  return outside * 10 + Math.abs(value - CROP_TARGET);
}

function trimToBand(
  lead: PlacedObject,
  blockers: PlacedObject[],
  followers: PlacedObject[],
  scale: number,
  frame: { w: number; h: number },
): void {
  const startX = lead.x;
  const startY = lead.y;
  const union = unionBox(blockers.map((object) => axisBox(object, scale)));
  const initial = axisBox(lead, scale);
  const beside =
    initial.x + initial.w <= union.x + 1 || initial.x >= union.x + union.w - 1;
  const axis: 'x' | 'y' = beside ? 'y' : 'x';
  const span = axis === 'y' ? frame.h : frame.w;
  let bestOffset = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let offset = -span; offset <= span; offset += 4) {
    lead.x = startX + (axis === 'x' ? offset : 0);
    lead.y = startY + (axis === 'y' ? offset : 0);
    const score = bandSlideScore(lead, blockers, union, scale, frame);
    if (score < bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  const dx = axis === 'x' ? bestOffset : 0;
  const dy = axis === 'y' ? bestOffset : 0;
  lead.x = startX + dx;
  lead.y = startY + dy;
  for (const rider of followers) {
    rider.x += dx;
    rider.y += dy;
  }
}
