import { FORMATS } from '../model/formats.ts';
import type { FormatId, PlacedObject } from '../model/types.ts';
import { nextUid } from './uid.ts';

/** Monochrome companions, preferred when they are not already in the scene. */
const BACKDROP_POOL = [
  'flowers',
  'lamp',
  'coin',
  'pen',
  'headphones',
  'folder',
  'wallet',
  'puzzle',
  'phone',
  'book',
];

/**
 * Adds two background-role objects when the scene has none.
 * Named objects already in the scene are left as they are.
 */
export function ensureBackdrop(
  objects: PlacedObject[],
  format: FormatId,
): PlacedObject[] {
  if (objects.some((object) => object.role === 'background')) return objects;
  const frame = FORMATS[format];
  const used = new Set(objects.map((object) => object.objectId));
  const picks = BACKDROP_POOL.filter((objectId) => !used.has(objectId)).slice(
    0,
    2,
  );
  const edges = [
    { x: -0.06, y: 0.18, rotation: 8 },
    { x: 1.04, y: 0.78, rotation: -7 },
  ];
  const added: PlacedObject[] = [];
  const pending = objects;
  for (const [index, objectId] of picks.entries()) {
    const edge = edges[index] ?? edges[0];
    if (!edge) continue;
    const object: PlacedObject = {
      uid: nextUid([...pending, ...added]),
      objectId,
      role: 'background',
      x: edge.x * frame.w,
      y: edge.y * frame.h,
      rotation: edge.rotation,
      z: -1 - index,
    };
    added.push(object);
  }
  return added.length === 0 ? objects : [...objects, ...added];
}
