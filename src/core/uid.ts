import type { PlacedObject } from '../model/types.ts';

/** Next `obj-N` id, one past the highest uid already in the scene. */
export function nextUid(objects: PlacedObject[]): string {
  let max = 0;
  for (const object of objects) {
    const match = /^obj-(\d+)$/.exec(object.uid);
    if (match?.[1]) max = Math.max(max, Number(match[1]));
  }
  return `obj-${max + 1}`;
}
