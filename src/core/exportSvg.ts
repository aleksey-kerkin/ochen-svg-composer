import { frameMarkup, recolorAsset, resolvePalette } from './recolor.ts';
import { getAsset, scopeAsset } from '../library/registry.ts';
import manifestJson from '../library/manifest.json' with { type: 'json' };
import { FORMATS, coverPlacement, coverTransform } from '../model/formats.ts';
import { renderScale } from '../model/scale.ts';
import type {
  Composition,
  FormatId,
  Manifest,
  Palette,
} from '../model/types.ts';
import { objectTransform } from '../ui/transforms.ts';

const library = manifestJson as Manifest;

const names = new Map(
  library.items.map((item) => [item.objectId, item.name.ru]),
);

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, digits: string) =>
      String.fromCodePoint(Number(digits)),
    )
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/** Source files store Cyrillic ids as the UTF-8 bytes of the name. */
function recoverMojibake(value: string): string {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || code > 255) return value;
    bytes.push(code);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(bytes),
    );
  } catch {
    return value;
  }
}

function slugifyId(value: string): string {
  let slug = '';
  for (const char of recoverMojibake(decodeXmlEntities(value))) {
    const mapped = CYRILLIC[char.toLowerCase()];
    if (mapped !== undefined) {
      slug += char === char.toLowerCase() ? mapped : capitalize(mapped);
      continue;
    }
    slug += /[A-Za-z0-9_-]/.test(char) ? char : '-';
  }
  const cleaned = slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'layer';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every id in the file is ASCII, and clip/href references follow. */
function asciiizeIds(markup: string): string {
  const rawIds = new Set<string>();
  for (const match of markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
    if (match[1]) rawIds.add(match[1]);
  }
  for (const match of markup.matchAll(/url\(\s*["']?#([^"')]+)["']?\s*\)/g)) {
    if (match[1]) rawIds.add(match[1]);
  }
  for (const match of markup.matchAll(
    /\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/g,
  )) {
    if (match[1]) rawIds.add(match[1]);
  }
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const raw of rawIds) {
    const base = slugifyId(raw);
    let next = base;
    let index = 2;
    while (used.has(next)) {
      next = `${base}-${index}`;
      index += 1;
    }
    used.add(next);
    map.set(raw, next);
  }
  const ordered = [...map.entries()].sort(
    (left, right) => right[0].length - left[0].length,
  );
  let result = markup;
  for (const [raw, next] of ordered) {
    if (raw === next) continue;
    const escaped = escapeRegExp(raw);
    result = result.replace(
      new RegExp(String.raw`(\bid\s*=\s*["'])${escaped}(["'])`, 'g'),
      `$1${next}$2`,
    );
    result = result.replace(
      new RegExp(String.raw`(url\(\s*["']?#)${escaped}(["']?\s*\))`, 'g'),
      `$1${next}$2`,
    );
    result = result.replace(
      new RegExp(
        String.raw`(\b(?:xlink:)?href\s*=\s*["']#)${escaped}(["'])`,
        'g',
      ),
      `$1${next}$2`,
    );
  }
  return result;
}

/**
 * Standalone SVG of the current scene. Paths stay the library originals;
 * only fill and stroke change. The frame clip hides anything past the edge.
 */
export function exportSvg(composition: Composition, palette?: Palette): string {
  const colors = palette ?? resolvePalette(composition.paletteId, []);
  const frame = FORMATS[composition.format];
  const scale = renderScale(composition.scale, composition.size);
  const background = frameMarkup(colors, composition.size);
  const cover = coverTransform(
    coverPlacement(frame.w, frame.h, background.svgSize.w),
  );
  const objects = [...composition.objects].sort(
    (left, right) => left.z - right.z || left.uid.localeCompare(right.uid),
  );
  const groups = objects.map((object) => {
    const asset = scopeAsset(
      getAsset(object.objectId, composition.size, object.role),
      object.uid,
    );
    const painted = recolorAsset(
      asset.inner,
      colors,
      object.role,
      object.role === 'main' ? (object.colorShift ?? 0) : 0,
    ).markup;
    const name = names.get(object.objectId) ?? object.objectId;
    const label = `${name} · ${object.role}`;
    const transform = objectTransform(object, scale, asset.svgSize);
    return `<g id="${escapeXml(`${object.objectId}-${object.role}-${object.uid}`)}" data-name="${escapeXml(label)}" data-object="${escapeXml(object.objectId)}" data-role="${object.role}" transform="${escapeXml(transform)}">${painted}</g>`;
  });
  return asciiizeIds(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="none" width="${frame.w}" height="${frame.h}" viewBox="0 0 ${frame.w} ${frame.h}">
  <defs>
    <clipPath id="frame-clip"><rect width="${frame.w}" height="${frame.h}"/></clipPath>
  </defs>
  <g id="composition" data-name="composition" clip-path="url(#frame-clip)">
    <g id="background" data-name="Фон" data-layer="background" transform="${escapeXml(cover)}">${background.inner}</g>
    ${groups.join('\n    ')}
  </g>
</svg>
`);
}

/** Calendar date in the viewer's local timezone, not UTC. */
export function localDateStamp(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Format and date, or the metaphor/title when the scene was composed from one. */
export function exportFileName(input: {
  format: FormatId;
  title?: string;
  date?: Date;
}): string {
  const date = input.date ?? new Date();
  const stamp = localDateStamp(date);
  const title = input.title
    ?.trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${title || input.format}-${stamp}.svg`;
}
