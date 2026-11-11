import { validatePalette } from '../core/palette.ts';
import { schemeById } from '../core/recolor.ts';
import type { Palette } from '../model/types.ts';

export const PALETTE_KEY = 'ochen.palette';

export interface PaletteMemory {
  paletteId: string;
  customPalettes: Palette[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function parseStoredPalette(entry: unknown): Palette | null {
  if (!isRecord(entry) || typeof entry.id !== 'string') return null;
  if (!entry.id.startsWith('custom-') || schemeById(entry.id)) return null;
  const name = typeof entry.name === 'string' ? entry.name : 'Своя палитра';
  const colors = isRecord(entry.colors) ? entry.colors : null;
  if (!colors) return null;
  const stringColors: Record<string, string> = {};
  for (const [slot, color] of Object.entries(colors)) {
    if (typeof color === 'string') stringColors[slot] = color;
  }
  const validated = validatePalette(stringColors, name);
  if (!validated.ok) return null;
  return {
    id: entry.id,
    name: validated.palette.name,
    colors: validated.palette.colors,
  };
}

/** Drops broken colors and unknown scheme ids. Returns null when nothing usable remains. */
export function parsePaletteMemory(raw: string | null): PaletteMemory | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const customPalettes: Palette[] = [];
  if (Array.isArray(parsed.customPalettes)) {
    for (const entry of parsed.customPalettes) {
      const palette = parseStoredPalette(entry);
      if (palette) customPalettes.push(palette);
    }
  }
  const requested =
    typeof parsed.paletteId === 'string' ? parsed.paletteId : '';
  const known =
    schemeById(requested) !== undefined ||
    customPalettes.some((palette) => palette.id === requested);
  if (!known && customPalettes.length === 0) return null;
  return {
    paletteId: known ? requested : (customPalettes[0]?.id ?? 'lilac'),
    customPalettes,
  };
}

export function readPaletteMemory(): PaletteMemory | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return parsePaletteMemory(localStorage.getItem(PALETTE_KEY));
  } catch {
    return null;
  }
}

export function writePaletteMemory(memory: PaletteMemory): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PALETTE_KEY, JSON.stringify(memory));
}
