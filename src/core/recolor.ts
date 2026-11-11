import {
  getAsset,
  getBackgroundAsset,
  type AssetSvg,
} from '../library/registry.ts';
import manifestJson from '../library/manifest.json' with { type: 'json' };
import { RULE_EXEMPT, SLOT_ORDER } from '../model/types.ts';
import type {
  Composition,
  Hex,
  Manifest,
  Palette,
  Role,
  Slot,
} from '../model/types.ts';

const manifest = manifestJson as Manifest;
const OBJ_SLOTS = [
  'obj.1',
  'obj.2',
  'obj.3',
] as const satisfies readonly Slot[];
const BG_SLOTS = [
  'bg.base',
  'bg.mid',
  'bg.dark',
  'ink',
] as const satisfies readonly Slot[];

const COLOR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/g;

export interface RecolorResult {
  markup: string;
  unknown: string[];
}

export interface PaletteViolation {
  color: string;
  where: 'frame' | 'background';
}

export interface RecolorPart {
  kind: 'frame' | 'object';
  role?: Role;
  markup: string;
}

export function normalizeHex(value: string): Hex | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  const digits = match?.[1]?.toLowerCase();
  if (!digits) return null;
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((char) => char + char)
          .join('')
      : digits;
  return `#${full}`;
}

export function cycleObjSlot(slot: Slot, shift: number): Slot {
  const index = OBJ_SLOTS.indexOf(slot as (typeof OBJ_SLOTS)[number]);
  if (index < 0) return slot;
  const steps =
    ((shift % OBJ_SLOTS.length) + OBJ_SLOTS.length) % OBJ_SLOTS.length;
  return OBJ_SLOTS[(index + steps) % OBJ_SLOTS.length] ?? slot;
}

/** Source slot color → the same slot in the target. `shift` cycles obj.1–obj.3. */
export function buildColorMap(
  source: Palette,
  target: Palette,
  shift = 0,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const slot of SLOT_ORDER) {
    map.set(
      normalizeHex(source.colors[slot]) ?? source.colors[slot],
      normalizeHex(target.colors[cycleObjSlot(slot, shift)]) ??
        target.colors[cycleObjSlot(slot, shift)],
    );
  }
  return map;
}

export function recolorSvg(
  inner: string,
  map: Map<string, string>,
  role: Role | 'frame',
): RecolorResult {
  const unknown: string[] = [];

  const paintValue = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^(none|transparent)$/i.test(trimmed) || /^url\(/i.test(trimmed)) {
      return raw;
    }
    const hex = normalizeHex(trimmed);
    if (!hex) return raw;
    const next = map.get(hex);
    if (!next) {
      if (!unknown.includes(hex)) {
        unknown.push(hex);
        console.warn(`Unknown SVG color ${hex} on ${role}`);
      }
      return raw;
    }
    return raw.replace(COLOR, next);
  };

  const markup = inner
    .replace(
      /\b(fill|stroke|stop-color)\s*=\s*(["'])(.*?)\2/gi,
      (_whole, name: string, quote: string, value: string) =>
        `${name}=${quote}${paintValue(value)}${quote}`,
    )
    .replace(
      /\bstyle\s*=\s*(["'])(.*?)\1/gi,
      (_whole, quote: string, value: string) => {
        const painted = value.replace(
          /(fill|stroke)\s*:\s*([^;]+)/gi,
          (_part, prop: string, color: string) =>
            `${prop}:${paintValue(color)}`,
        );
        return `style=${quote}${painted}${quote}`;
      },
    );

  return { markup, unknown };
}

export function schemeById(id: string): Palette | undefined {
  return manifest.schemes.find((scheme) => scheme.id === id);
}

export function resolvePalette(id: string, custom: Palette[]): Palette {
  const palette =
    custom.find((entry) => entry.id === id) ??
    schemeById(id) ??
    schemeById('lilac');
  if (!palette) throw new Error(`Unknown palette ${id}`);
  return palette;
}

/** Built-in schemes keep their exported frame. Any other palette recolors lilac. */
export function frameMarkup(
  palette: Palette,
  size: Composition['size'],
): AssetSvg {
  const scheme = manifest.schemes.find((entry) => entry.id === palette.id);
  if (scheme) return quietFrame(getBackgroundAsset(scheme.id, size));
  const lilac = getBackgroundAsset('lilac', size);
  return quietFrame({
    ...lilac,
    inner: recolorAsset(lilac.inner, palette, 'frame').markup,
  });
}

/** Long accent strokes sit in the empty field. Keep them, but quieter. */
function quietFrame(asset: AssetSvg): AssetSvg {
  const inner = asset.inner
    .replace(/<line\b(?![^>]*\bopacity=)/g, '<line opacity="0.28"')
    .replace(
      /<path\b(?![^>]*\bopacity=)([^>]*\bstroke=)/g,
      '<path opacity="0.28"$1',
    );
  return { ...asset, inner };
}

export function recolorAsset(
  inner: string,
  target: Palette,
  role: Role | 'frame',
  shift = 0,
): RecolorResult {
  const source = schemeById('lilac');
  if (!source) throw new Error('Lilac source scheme is missing');
  return recolorSvg(inner, buildColorMap(source, target, shift), role);
}

function colorsIn(markup: string): string[] {
  const found: string[] = [];
  const take = (value: string) => {
    const trimmed = value.trim();
    if (/^(none|transparent)$/i.test(trimmed) || /^url\(/i.test(trimmed)) {
      return;
    }
    const hex = normalizeHex(trimmed);
    if (hex) found.push(hex);
  };
  for (const match of markup.matchAll(
    /\b(?:fill|stroke|stop-color)\s*=\s*(["'])(.*?)\1/gi,
  )) {
    if (match[2]) take(match[2]);
  }
  for (const match of markup.matchAll(/\bstyle\s*=\s*(["'])(.*?)\1/gi)) {
    const style = match[2] ?? '';
    for (const part of style.matchAll(/(?:fill|stroke)\s*:\s*([^;]+)/gi)) {
      if (part[1]) take(part[1]);
    }
  }
  return found;
}

function objectSet(palette: Palette): Set<string> {
  const background = new Set(
    BG_SLOTS.map((slot) => normalizeHex(palette.colors[slot])).filter(
      (color): color is Hex => color !== null,
    ),
  );
  const colors = OBJ_SLOTS.filter((slot) => !RULE_EXEMPT.includes(slot))
    .map((slot) => normalizeHex(palette.colors[slot]))
    .filter((color): color is Hex => color !== null && !background.has(color));
  return new Set(colors);
}

export function validatePaletteUsage(
  composition: Composition,
  palette: Palette,
  parts?: RecolorPart[],
): PaletteViolation[] {
  const scanned = parts ?? partsOf(composition, palette);
  const forbidden = objectSet(palette);
  const violations: PaletteViolation[] = [];
  for (const part of scanned) {
    if (part.kind === 'object' && part.role === 'main') continue;
    const where = part.kind === 'frame' ? 'frame' : 'background';
    for (const color of colorsIn(part.markup)) {
      if (forbidden.has(color)) violations.push({ color, where });
    }
  }
  return violations;
}

function partsOf(composition: Composition, palette: Palette): RecolorPart[] {
  const scheme = manifest.schemes.find((entry) => entry.id === palette.id);
  const frame = scheme
    ? getBackgroundAsset(scheme.id, composition.size).inner
    : recolorAsset(
        getBackgroundAsset('lilac', composition.size).inner,
        palette,
        'frame',
      ).markup;
  const objects = composition.objects.map((object) => ({
    kind: 'object' as const,
    role: object.role,
    markup: recolorAsset(
      getAsset(object.objectId, composition.size, object.role).inner,
      palette,
      object.role,
      object.role === 'main' ? (object.colorShift ?? 0) : 0,
    ).markup,
  }));
  return [{ kind: 'frame', markup: frame }, ...objects];
}
