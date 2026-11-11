import manifestJson from './manifest.json' with { type: 'json' };
import type { Manifest, Role, Size } from '../model/types.ts';

export interface AssetSvg {
  inner: string;
  viewBox: [number, number, number, number];
  svgSize: { w: number; h: number };
}

const manifest = manifestJson as Manifest;

const svgModules = import.meta.glob('/src/assets/**/*.svg', {
  query: '?raw',
  eager: true,
  import: 'default',
});

const cache = new Map<string, AssetSvg>();

const SCHEME_IDS = new Set(manifest.schemes.map((scheme) => scheme.id));

/** Rewrites id, url(#id), and href="#id". Longer ids are replaced first. */
export function rewriteSvgIds(
  markup: string,
  replacements: ReadonlyArray<readonly [string, string]>,
): string {
  const ordered = [...replacements].sort(
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

export function prefixSvgIds(markup: string, prefix: string): string {
  const ids = collectIds(markup);
  return rewriteSvgIds(
    markup,
    [...ids].map((id) => [id, `${prefix}${id}`]),
  );
}

export function getAsset(objectId: string, size: Size, role: Role): AssetSvg {
  const key = `${objectId}:${size}:${role}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const item = manifest.items.find((entry) => entry.objectId === objectId);
  if (!item) throw new Error(`Unknown objectId: ${objectId}`);
  const asset = item.assets.find(
    (entry) => entry.size === size && entry.role === role,
  );
  if (!asset) {
    throw new Error(`Asset not found: ${objectId} ${size} ${role}`);
  }

  const extracted = extractSvg(readSvg(asset.src));
  if (
    !nearlyEqual(extracted.viewBox[2], asset.svgSize.w) ||
    !nearlyEqual(extracted.viewBox[3], asset.svgSize.h)
  ) {
    throw new Error(
      `viewBox does not match svgSize for ${objectId} ${size} ${role}`,
    );
  }

  const loaded: AssetSvg = {
    inner: prefixSvgIds(extracted.inner, `${objectId}-${size}-${role}-`),
    viewBox: [0, 0, asset.svgSize.w, asset.svgSize.h],
    svgSize: { w: asset.svgSize.w, h: asset.svgSize.h },
  };
  cache.set(key, loaded);
  return loaded;
}

export function getBackgroundAsset(schemeId: string, size: Size): AssetSvg {
  const key = `bg:${schemeId}:${size}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (!SCHEME_IDS.has(schemeId)) {
    throw new Error(`Unknown scheme: ${schemeId}`);
  }

  const src = `/src/assets/backgrounds/${schemeId}.${size}.svg`;
  const extracted = extractSvg(readSvg(src));
  const loaded: AssetSvg = {
    inner: prefixSvgIds(extracted.inner, `bg-${schemeId}-${size}-`),
    viewBox: extracted.viewBox,
    svgSize: { w: extracted.viewBox[2], h: extracted.viewBox[3] },
  };
  cache.set(key, loaded);
  return loaded;
}

export function scopeAsset(asset: AssetSvg, uid: string): AssetSvg {
  return {
    ...asset,
    inner: prefixSvgIds(asset.inner, `${uid}-`),
  };
}

function collectIds(markup: string): Set<string> {
  const ids = new Set<string>();
  for (const match of markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
    if (match[1]) ids.add(match[1]);
  }
  for (const match of markup.matchAll(/url\(\s*["']?#([^"')]+)["']?\s*\)/g)) {
    if (match[1]) ids.add(match[1]);
  }
  for (const match of markup.matchAll(
    /\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/g,
  )) {
    if (match[1]) ids.add(match[1]);
  }
  return ids;
}

function extractSvg(source: string): {
  inner: string;
  viewBox: [number, number, number, number];
} {
  const start = source.indexOf('<svg');
  const openEnd = start >= 0 ? source.indexOf('>', start) : -1;
  const close = source.lastIndexOf('</svg>');
  if (start < 0 || openEnd < 0 || close < openEnd) {
    throw new Error('SVG root element not found');
  }
  const openTag = source.slice(start, openEnd + 1);
  const viewBoxMatch = openTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/);
  const parts = viewBoxMatch?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    !parts ||
    parts.length !== 4 ||
    parts.some((part) => Number.isNaN(part))
  ) {
    throw new Error('SVG viewBox is missing or invalid');
  }
  const [x, y, width, height] = parts;
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    throw new Error('SVG viewBox is missing or invalid');
  }
  return {
    inner: source.slice(openEnd + 1, close).trim(),
    viewBox: [x, y, width, height],
  };
}

function readSvg(src: string): string {
  const normalized = src.startsWith('/') ? src : `/${src}`;
  const direct = svgModules[normalized] ?? svgModules[normalized.slice(1)];
  if (typeof direct === 'string') return direct;
  const found = Object.entries(svgModules).find(([key]) =>
    key.endsWith(normalized),
  );
  if (!found) {
    const sample = Object.keys(svgModules).slice(0, 3).join(', ');
    throw new Error(`SVG file not loaded: ${src}. Sample keys: ${sample}`);
  }
  return found[1];
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
