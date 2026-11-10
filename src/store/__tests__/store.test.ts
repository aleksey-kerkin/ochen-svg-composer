import { beforeEach, describe, expect, it } from 'vitest';
import { layoutScene, templateById } from '../../core/layout.ts';
import { FORMATS } from '../../model/formats.ts';
import { defaultScale, shortSide } from '../../model/scale.ts';
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

  it('keeps object centers as fractions of the frame when no template is set', () => {
    let state = place('pen', place('book'));
    const uid = state.objects[0]?.uid ?? '';
    state = reduceComposition(state, {
      type: 'move',
      uid,
      dx: 100,
      dy: -40,
    });
    state = reduceComposition(state, { type: 'rotate', uid, deg: 15 });
    const next = reduceComposition(state, {
      type: 'setFormat',
      format: 'portrait',
    });
    const from = FORMATS.landscape;
    const to = FORMATS.portrait;
    const object = byUid(state, uid);
    expect(next.format).toBe('portrait');
    expect(next.templateId).toBeUndefined();
    expect(byUid(next, uid).x).toBeCloseTo((object.x / from.w) * to.w);
    expect(byUid(next, uid).y).toBeCloseTo((object.y / from.h) * to.h);
    expect(byUid(next, uid).rotation).toBe(15);
    expect(byUid(next, uid).z).toBe(object.z);
    expect(next.scale).toBeCloseTo(
      state.scale * (shortSide('portrait') / shortSide('landscape')),
    );
    expect(next.scale).toBeCloseTo(defaultScale('portrait'));
  });

  it('lays current objects into the template and keeps every main', () => {
    const state = place('phone', place('puzzle', place('book')));
    const next = reduceComposition(state, {
      type: 'setTemplate',
      templateId: 'offset',
    });
    expect(next.templateId).toBe('offset');
    const scene = layoutScene(
      next.objects,
      templateById('offset', 'landscape'),
      state.seed,
    );
    expect(next.scale).toBeCloseTo(scene.scale);
    expect(next.scale).toBeLessThanOrEqual(
      templateById('offset', 'landscape').scale + 0.0001,
    );
    expect(next.scale).toBeGreaterThan(0.2);
    expect(
      next.objects
        .filter((object) => object.role === 'main')
        .map((object) => object.objectId)
        .sort(),
    ).toEqual(['book', 'phone', 'puzzle']);
    expect(next.objects.some((object) => object.role === 'background')).toBe(
      true,
    );
  });

  it('reapplies the active template on a format change instead of scaling pixels', () => {
    const state = reduceComposition(place('pen', place('book')), {
      type: 'setTemplate',
      templateId: 'offset',
    });
    const next = reduceComposition(state, {
      type: 'setFormat',
      format: 'portrait',
    });
    expect(next.templateId).toBe('offset');
    const scene = layoutScene(
      state.objects,
      templateById('offset', 'portrait'),
      state.seed,
    );
    expect(next.objects).toEqual(scene.objects);
    const from = FORMATS.landscape;
    const to = FORMATS.portrait;
    const stretched = state.objects.every((object) => {
      const placed = next.objects.find((entry) => entry.uid === object.uid);
      return (
        placed !== undefined &&
        Math.abs(placed.x - (object.x / from.w) * to.w) < 0.01 &&
        Math.abs(placed.y - (object.y / from.h) * to.h) < 0.01
      );
    });
    expect(stretched).toBe(false);
    expect(next.scale).toBeCloseTo(scene.scale);
    expect(next.scale).toBeLessThanOrEqual(
      templateById('offset', 'portrait').scale + 0.0001,
    );
  });

  it('keeps every main and the selection when the template has fewer slots', () => {
    const state = reduceComposition(place('phone', place('book')), {
      type: 'select',
      uid: 'obj-1',
    });
    const next = reduceComposition(state, {
      type: 'setTemplate',
      templateId: 'under-title',
    });
    expect(
      next.objects
        .filter((object) => object.role === 'main')
        .map((object) => object.uid)
        .sort(),
    ).toEqual(['obj-1', 'obj-2']);
    expect(next.selectedUid).toBe('obj-1');
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

  it('cycles obj colors on a main object and keeps the shift on a copy', () => {
    const state = place('book');
    const uid = state.objects[0]?.uid ?? '';
    const once = reduceComposition(state, { type: 'cycleColors', uid });
    expect(byUid(once, uid).colorShift).toBe(1);
    const twice = reduceComposition(once, { type: 'cycleColors', uid });
    expect(byUid(twice, uid).colorShift).toBe(2);
    const back = reduceComposition(twice, { type: 'cycleColors', uid });
    expect(byUid(back, uid).colorShift ?? 0).toBe(0);
    const copy = reduceComposition(twice, { type: 'duplicate', uid });
    expect(byUid(copy, 'obj-2').colorShift).toBe(2);
    const background = reduceComposition(state, {
      type: 'toggleRole',
      uid,
    });
    const skipped = reduceComposition(background, {
      type: 'cycleColors',
      uid,
    });
    expect(byUid(skipped, uid).colorShift).toBeUndefined();
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

  it('stores a loaded palette and rejects a short one', () => {
    useComposition
      .getState()
      .addPalette(
        [
          '#112233',
          '#223344',
          '#334455',
          '#181817',
          '#aabbcc',
          '#bbccdd',
          '#ccddee',
          '#ffffff',
        ].join('\n'),
      );
    const loaded = useComposition.getState();
    expect(loaded.customPalettes).toHaveLength(1);
    expect(loaded.paletteId).toBe(loaded.customPalettes[0]?.id);
    expect(loaded.paletteError).toBeUndefined();
    useComposition.getState().addPalette('#112233');
    expect(useComposition.getState().customPalettes).toHaveLength(1);
    expect(useComposition.getState().paletteError).toMatch(/8/);
  });

  it('replaces the scene from a name query and keeps size, palette, and editing', () => {
    useComposition.getState().setPalette('peach');
    useComposition.getState().setSize('S');
    useComposition.getState().setFormat('portrait');
    useComposition.getState().add('lamp', 'main');
    useComposition.getState().composeNames('наушники и ваза');
    const placed = useComposition.getState();
    expect(placed.paletteId).toBe('peach');
    expect(placed.size).toBe('S');
    expect(placed.format).toBe('portrait');
    expect(
      placed.objects
        .filter((object) => object.role === 'main')
        .map((object) => object.objectId)
        .sort(),
    ).toEqual(['flowers', 'headphones']);
    expect(placed.objects.some((object) => object.role === 'background')).toBe(
      true,
    );
    expect(placed.nameQuery?.unknown).toEqual([]);
    const uid = placed.objects[0]?.uid ?? '';
    const before = placed.objects[0]?.x ?? 0;
    useComposition.getState().move(uid, 12, 0);
    expect(useComposition.getState().objects[0]?.x).toBeCloseTo(before + 12);
    const ids = useComposition
      .getState()
      .objects.map((object) => object.objectId)
      .sort();
    useComposition.getState().composeNames('хрюндель');
    const skipped = useComposition.getState();
    expect(skipped.objects.map((object) => object.objectId).sort()).toEqual(
      ids,
    );
    expect(skipped.nameQuery?.unknown).toEqual(['хрюндель']);
  });

  it('adds an object through the zustand store', () => {
    useComposition.getState().add('wallet', 'background');
    const state = useComposition.getState();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]?.objectId).toBe('wallet');
    expect(state.objects[0]?.role).toBe('background');
  });
});
