import { SLOT_ORDER } from '../model/types.ts';
import type { Hex, Slot } from '../model/types.ts';
import { normalizeHex } from './recolor.ts';

const BG_SLOTS = [
  'bg.base',
  'bg.mid',
  'bg.dark',
  'ink',
] as const satisfies readonly Slot[];

export interface ParsedPalette {
  name: string;
  colors: Record<Slot, Hex>;
}

export type PaletteResult =
  { ok: true; palette: ParsedPalette } | { ok: false; error: string };

export function validatePalette(
  colors: Partial<Record<string, string>>,
  name = 'Своя палитра',
): PaletteResult {
  const missing = SLOT_ORDER.filter((slot) => colors[slot] === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Нужно ровно 8 цветов в порядке ${SLOT_ORDER.join(', ')}. Не хватает: ${missing.join(', ')}.`,
    };
  }

  const normalized = {} as Record<Slot, Hex>;
  for (const slot of SLOT_ORDER) {
    const hex = normalizeHex(colors[slot] ?? '');
    if (!hex) {
      return {
        ok: false,
        error: `Неверный цвет «${colors[slot] ?? ''}» в слоте ${slot}. Ожидается #RRGGBB.`,
      };
    }
    normalized[slot] = hex;
  }

  const background = new Set(BG_SLOTS.map((slot) => normalized[slot]));
  for (const slot of ['obj.1', 'obj.2', 'obj.3'] as const) {
    if (background.has(normalized[slot])) {
      const clash = BG_SLOTS.find((bg) => normalized[bg] === normalized[slot]);
      return {
        ok: false,
        error: `${slot} совпадает с цветом фона ${clash}. Цвета объектов не могут использоваться в фонах.`,
      };
    }
  }

  return { ok: true, palette: { name, colors: normalized } };
}

export function parsePaletteInput(text: string): PaletteResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: 'Пустая палитра. Нужны 8 цветов.' };
  }
  if (trimmed.startsWith('{')) {
    return parseJsonPalette(trimmed);
  }
  const tokens = trimmed.split(/[\s,;]+/).filter((token) => token.length > 0);
  if (tokens.length !== SLOT_ORDER.length) {
    return {
      ok: false,
      error: `Нужно ровно 8 цветов, получено ${tokens.length}. Порядок: ${SLOT_ORDER.join(', ')}.`,
    };
  }
  const colors: Partial<Record<Slot, string>> = {};
  SLOT_ORDER.forEach((slot, index) => {
    colors[slot] = tokens[index];
  });
  return validatePalette(colors);
}

function parseJsonPalette(text: string): PaletteResult {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: 'Не удалось прочитать JSON палитры.' };
  }
  if (!value || typeof value !== 'object' || !('colors' in value)) {
    return {
      ok: false,
      error: 'JSON палитры должен содержать объект colors с 8 слотами.',
    };
  }
  const record = value as { name?: unknown; colors?: unknown };
  const name =
    typeof record.name === 'string' && record.name.trim().length > 0
      ? record.name.trim()
      : 'Своя палитра';
  if (!record.colors || typeof record.colors !== 'object') {
    return {
      ok: false,
      error: 'JSON палитры должен содержать объект colors с 8 слотами.',
    };
  }
  const colors: Partial<Record<string, string>> = {};
  for (const [slot, color] of Object.entries(
    record.colors as Record<string, unknown>,
  )) {
    if (typeof color === 'string') colors[slot] = color;
  }
  return validatePalette(colors, name);
}
