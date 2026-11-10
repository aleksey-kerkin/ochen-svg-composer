import { create } from 'zustand';
import { parsePaletteInput } from '../core/palette.ts';
import { schemeById, validatePaletteUsage } from '../core/recolor.ts';
import type {
  Composition,
  FormatId,
  Palette,
  Role,
  Size,
} from '../model/types.ts';
import {
  initialComposition,
  reduceComposition,
  type CompositionAction,
} from './composition.ts';

type CompositionStore = Composition & {
  customPalettes: Palette[];
  paletteError?: string;
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
  setScale: (scale: number) => void;
  setPalette: (paletteId: string) => void;
  addPalette: (text: string) => void;
  toggleRole: (uid: string) => void;
  cycleColors: (uid: string) => void;
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

function usageError(
  state: CompositionStore,
  palette: Palette,
): string | undefined {
  const preview = { ...readComposition(state), paletteId: palette.id };
  const violations = validatePaletteUsage(preview, palette);
  if (violations.length === 0) return undefined;
  const colors = [...new Set(violations.map((item) => item.color))].join(', ');
  return `Цвета объектов попали в фон (${colors}). Палитра не применена.`;
}

function withoutPaletteError(state: CompositionStore): CompositionStore {
  const next = { ...state };
  delete next.paletteError;
  return next;
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
  customPalettes: [],
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
  setScale: (scale) =>
    set((state) => apply(state, { type: 'setScale', scale })),
  setPalette: (paletteId) =>
    set((state) => {
      const palette =
        state.customPalettes.find((entry) => entry.id === paletteId) ??
        schemeById(paletteId);
      if (!palette) return state;
      const error = usageError(state, palette);
      if (error) return { ...state, paletteError: error };
      return withoutPaletteError(
        apply(state, { type: 'setPalette', paletteId }),
      );
    }),
  addPalette: (text) =>
    set((state) => {
      const parsed = parsePaletteInput(text);
      if (!parsed.ok) return { ...state, paletteError: parsed.error };
      const palette: Palette = {
        id: `custom-${state.customPalettes.length + 1}`,
        name: parsed.palette.name,
        colors: parsed.palette.colors,
      };
      const error = usageError(state, palette);
      if (error) return { ...state, paletteError: error };
      const next = apply(
        { ...state, customPalettes: [...state.customPalettes, palette] },
        { type: 'setPalette', paletteId: palette.id },
      );
      return withoutPaletteError(next);
    }),
  toggleRole: (uid) =>
    set((state) => apply(state, { type: 'toggleRole', uid })),
  cycleColors: (uid) =>
    set((state) => apply(state, { type: 'cycleColors', uid })),
  reseed: () => set((state) => apply(state, { type: 'reseed' })),
}));
