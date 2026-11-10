import { beforeEach, describe, expect, it } from 'vitest';
import { defaultScale } from '../../model/scale.ts';
import type { Composition, PlacedObject } from '../../model/types.ts';
import { initialComposition, reduceComposition } from '../composition.ts';
import { useComposition } from '../useComposition.ts';

function place(
  objectId: string,
  state: Composition = initialComposition(),
): Composition {
  return reduceComposition(state, {
    type: 'add',
    objectId,
    role: 'main',
  });
}

function byUid(state: Composition, uid: string): PlacedObject {
  const object = state.objects.find((entry) => entry.uid === uid);
  if (!object) throw new Error(`missing ${uid}`);
  return object;
}

describe('composition reducer', () => {
  it('adds a library object at the center of the frame', () => {
    const state = place('book');
    expect(state.objects).toHaveLength(1);
    const object = state.objects[0];
    expect(object?.objectId).toBe('book');
    expect(object?.role).toBe('main');
    expect(object?.uid).toBe('obj-1');
    expect(object?.x).toBe(600);
    expect(object?.y).toBe(315);
    expect(object?.rotation).toBe(0);
    expect(object?.z).toBe(0);
  });

  it('rejects an objectId that is not in the manifest', () => {
    expect(() => place('dragon')).toThrow(/dragon/);
  });

  it('stacks each added object above the previous one', () => {
    const state = place('phone', place('book'));
    expect(state.objects.map((object) => object.z)).toEqual([0, 1]);
    expect(state.objects.map((object) => object.uid)).toEqual([
      'obj-1',
      'obj-2',
    ]);
  });

  it('does not put scale on an object', () => {
    const state = place('book');
    expect(state.objects[0]).toBeDefined();
    expect(state.objects[0]).not.toHaveProperty('scale');
    expect(state.scale).toBeCloseTo(defaultScale('landscape'));
    expect(state.scale).toBeLessThanOrEqual(0.4);
  });

  it('changes the one scene scale and leaves objects unscaled', () => {
    const state = place('book');
    const next = reduceComposition(state, { type: 'setScale', scale: 0.5 });
    expect(next.scale).toBe(0.5);
    expect(next.objects[0]).not.toHaveProperty('scale');
    expect(next.objects).toEqual(state.objects);
  });

  it('moves an object by dx and dy without changing the previous state', () => {
    const state = place('book');
    const before = structuredClone(state);
    const object = state.objects[0];
    expect(object).toBeDefined();
    const moved = reduceComposition(state, {
      type: 'move',
      uid: object?.uid ?? '',
      dx: 10,
      dy: -4,
    });
    expect(byUid(moved, object?.uid ?? '').x).toBe(610);
    expect(byUid(moved, object?.uid ?? '').y).toBe(311);
    expect(state).toEqual(before);
  });

  it('sets rotation to the given degrees', () => {
    const state = place('book');
    const uid = state.objects[0]?.uid ?? '';
    const turned = reduceComposition(
      reduceComposition(state, { type: 'rotate', uid, deg: 15 }),
      { type: 'rotate', uid, deg: 40 },
    );
    expect(byUid(turned, uid).rotation).toBe(40);
  });

  it('duplicates with a new uid', () => {
    const state = place('book');
    const uid = state.objects[0]?.uid ?? '';
    const next = reduceComposition(state, { type: 'duplicate', uid });
    expect(next.objects.map((object) => object.uid)).toEqual([uid, 'obj-2']);
    expect(next.objects[1]?.objectId).toBe('book');
    expect(next.objects[1]?.role).toBe('main');
  });

  it('offsets a duplicate by 24px on both axes', () => {
    const state = place('book');
    const source = state.objects[0];
    expect(source).toBeDefined();
    const next = reduceComposition(state, {
      type: 'duplicate',
      uid: source?.uid ?? '',
    });
    const copy = next.objects[1];
    expect(copy?.x).toBe((source?.x ?? 0) + 24);
    expect(copy?.y).toBe((source?.y ?? 0) + 24);
    expect(copy?.rotation).toBe(source?.rotation);
  });

  it('places a duplicate one step above its source', () => {
    const state = place('pen', place('phone', place('book')));
    const source = state.objects[0];
    expect(source?.z).toBe(0);
    const next = reduceComposition(state, {
      type: 'duplicate',
      uid: source?.uid ?? '',
    });
    const copy = next.objects.find((object) => object.uid === 'obj-4');
    expect(copy?.z).toBe(1);
    expect(next.objects.find((object) => object.uid === 'obj-2')?.z).toBe(2);
    expect(next.objects.find((object) => object.uid === 'obj-3')?.z).toBe(3);
    expect(byUid(next, source?.uid ?? '').z).toBe(0);
  });

  it('removes an object and clears the selection when it was selected', () => {
    const state = place('phone', place('book'));
    const uid = state.objects[0]?.uid ?? '';
    const selected = reduceComposition(state, { type: 'select', uid });
    const next = reduceComposition(selected, { type: 'remove', uid });
    expect(next.objects.map((object) => object.uid)).toEqual(['obj-2']);
    expect(next.selectedUid).toBeUndefined();
  });

  it('does not move z past the ends of the stack', () => {
    const state = place('pen', place('phone', place('book')));
    const bottom = state.objects[0]?.uid ?? '';
    const top = state.objects[2]?.uid ?? '';
    const sent = reduceComposition(state, {
      type: 'sendBackward',
      uid: bottom,
    });
    const brought = reduceComposition(state, {
      type: 'bringForward',
      uid: top,
    });
    expect(sent.objects.map((object) => object.z)).toEqual([0, 1, 2]);
    expect(brought.objects.map((object) => object.z)).toEqual([0, 1, 2]);
  });

  it('swaps z with the neighbor when moving one step in the stack', () => {
    const state = place('pen', place('phone', place('book')));
    const middle = state.objects[1]?.uid ?? '';
    const raised = reduceComposition(state, {
      type: 'bringForward',
      uid: middle,
    });
    expect(raised.objects.map((object) => object.z)).toEqual([0, 2, 1]);
    const lowered = reduceComposition(state, {
      type: 'sendBackward',
      uid: middle,
    });
    expect(lowered.objects.map((object) => object.z)).toEqual([1, 0, 2]);
  });

  it('keeps x and y when the size changes', () => {
    const added = place('book');
    const uid = added.objects[0]?.uid ?? '';
    const moved = reduceComposition(added, {
      type: 'move',
      uid,
      dx: 12,
      dy: 8,
    });
    const turned = reduceComposition(moved, {
      type: 'rotate',
      uid,
      deg: 20,
    });
    const next = reduceComposition(turned, { type: 'setSize', size: 'S' });
    expect(next.size).toBe('S');
    expect(next.scale).toBe(turned.scale);
    expect(byUid(next, uid).x).toBe(byUid(turned, uid).x);
    expect(byUid(next, uid).y).toBe(byUid(turned, uid).y);
    expect(byUid(next, uid).rotation).toBe(20);
  });

  it('changes the format without moving objects', () => {
    const state = place('book');
    const next = reduceComposition(state, {
      type: 'setFormat',
      format: 'portrait',
    });
    expect(next.format).toBe('portrait');
    expect(next.objects).toEqual(state.objects);
    expect(next.scale).toBeCloseTo(defaultScale('portrait'));
  });

  it('keeps a custom scale proportional to the short side', () => {
    const state = reduceComposition(initialComposition(), {
      type: 'setScale',
      scale: 0.5,
    });
    const square = reduceComposition(state, {
      type: 'setFormat',
      format: 'square',
    });
    expect(square.scale).toBeCloseTo(
      0.5 * (defaultScale('square') / defaultScale('landscape')),
    );
    const back = reduceComposition(square, {
      type: 'setFormat',
      format: 'landscape',
    });
    expect(back.scale).toBeCloseTo(0.5);
  });

  it('sets the palette id', () => {
    const next = reduceComposition(initialComposition(), {
      type: 'setPalette',
      paletteId: 'peach',
    });
    expect(next.paletteId).toBe('peach');
  });

  it('toggles main and background for any object', () => {
    const state = place('headphones');
    const uid = state.objects[0]?.uid ?? '';
    const background = reduceComposition(state, { type: 'toggleRole', uid });
    expect(byUid(background, uid).role).toBe('background');
    const main = reduceComposition(background, { type: 'toggleRole', uid });
    expect(byUid(main, uid).role).toBe('main');
  });

  it('selects an object and clears the selection', () => {
    const state = place('lamp');
    const uid = state.objects[0]?.uid ?? '';
    const selected = reduceComposition(state, { type: 'select', uid });
    expect(selected.selectedUid).toBe(uid);
    const cleared = reduceComposition(selected, { type: 'select' });
    expect(cleared.selectedUid).toBeUndefined();
  });

  it('increments the seed', () => {
    const next = reduceComposition(initialComposition(), { type: 'reseed' });
    expect(next.seed).toBe(2);
  });

  it('stays JSON-serializable with a selection', () => {
    const state = place('folder');
    const uid = state.objects[0]?.uid ?? '';
    const selected = reduceComposition(state, { type: 'select', uid });
    expect(selected.objects).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(selected))).toEqual(selected);
  });
});

describe('useComposition', () => {
  beforeEach(() => {
    useComposition.setState(useComposition.getInitialState(), true);
  });

  it('adds an object through the zustand store', () => {
    useComposition.getState().add('wallet', 'background');
    const state = useComposition.getState();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]?.objectId).toBe('wallet');
    expect(state.objects[0]?.role).toBe('background');
  });
});
