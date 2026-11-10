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

/** XML Name: readable, unique, no spaces. */
function xmlId(value: string): string {
  const cleaned = value
    .replace(/[^\w\u0400-\u04FF.-]+/g, '-')
    .replace(/^-+/, '');
  const id = cleaned || 'object';
  return /^[A-Za-z_\u0400-\u04FF]/.test(id) ? id : `id-${id}`;
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
    return `<g id="${escapeXml(xmlId(`${name}-${object.role}-${object.uid}`))}" data-name="${escapeXml(label)}" data-object="${escapeXml(object.objectId)}" data-role="${object.role}" transform="${escapeXml(transform)}">${painted}</g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${frame.w}" height="${frame.h}" viewBox="0 0 ${frame.w} ${frame.h}">
  <defs>
    <clipPath id="frame"><rect width="${frame.w}" height="${frame.h}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <g id="background" data-name="Фон" data-layer="background" transform="${escapeXml(cover)}">${background.inner}</g>
    ${groups.join('\n    ')}
  </g>
</svg>
`;
}

/** Format and date, or the metaphor/title when the scene was composed from one. */
export function exportFileName(input: {
  format: FormatId;
  title?: string;
  date?: Date;
}): string {
  const date = input.date ?? new Date();
  const stamp = date.toISOString().slice(0, 10);
  const title = input.title
    ?.trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${title || input.format}-${stamp}.svg`;
}
