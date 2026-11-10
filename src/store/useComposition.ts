import { create } from 'zustand';
import type { Composition, FormatId, Role, Size } from '../model/types.ts';
import {
  initialComposition,
  reduceComposition,
  type CompositionAction,
} from './composition.ts';

type CompositionStore = Composition & {
  add: (objectId: string, role: Role) => void;
  move: (uid: string, dx: number, dy: number) => void;
  rotate: (uid: string, deg: number) => void;
  duplicate: (uid: string) => void;
  remove: (uid: string) => void;
  bringForward: (uid: string) => void;
  sendBackward: (uid: string) => void;
  select: (uid?: string) => void;
  setFormat: (format: FormatId) => void;
  setSize: (size: Size) => void;
  setPalette: (paletteId: string) => void;
  toggleRole: (uid: string) => void;
  reseed: () => void;
};

function readComposition(state: CompositionStore): Composition {
  const composition: Composition = {
    format: state.format,
    size: state.size,
    paletteId: state.paletteId,
    scale: state.scale,
    objects: state.objects,
    seed: state.seed,
  };
  if (state.selectedUid !== undefined) {
    composition.selectedUid = state.selectedUid;
  }
  return composition;
}

function apply(
  state: CompositionStore,
  action: CompositionAction,
): CompositionStore {
  const next = reduceComposition(readComposition(state), action);
  return { ...state, ...next, selectedUid: next.selectedUid };
}

export const useComposition = create<CompositionStore>((set) => ({
  ...initialComposition(),
  add: (objectId, role) =>
    set((state) => apply(state, { type: 'add', objectId, role })),
  move: (uid, dx, dy) =>
    set((state) => apply(state, { type: 'move', uid, dx, dy })),
  rotate: (uid, deg) =>
    set((state) => apply(state, { type: 'rotate', uid, deg })),
  duplicate: (uid) => set((state) => apply(state, { type: 'duplicate', uid })),
  remove: (uid) => set((state) => apply(state, { type: 'remove', uid })),
  bringForward: (uid) =>
    set((state) => apply(state, { type: 'bringForward', uid })),
  sendBackward: (uid) =>
    set((state) => apply(state, { type: 'sendBackward', uid })),
  select: (uid) => set((state) => apply(state, { type: 'select', uid })),
  setFormat: (format) =>
    set((state) => apply(state, { type: 'setFormat', format })),
  setSize: (size) => set((state) => apply(state, { type: 'setSize', size })),
  setPalette: (paletteId) =>
    set((state) => apply(state, { type: 'setPalette', paletteId })),
  toggleRole: (uid) =>
    set((state) => apply(state, { type: 'toggleRole', uid })),
  reseed: () => set((state) => apply(state, { type: 'reseed' })),
}));
