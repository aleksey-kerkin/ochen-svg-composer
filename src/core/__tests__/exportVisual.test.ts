/** @vitest-environment jsdom */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { composePlacements } from '../compose.ts';
import { exportSvg } from '../exportSvg.ts';
import { resolvePalette } from '../recolor.ts';
import { FORMATS } from '../../model/formats.ts';
import { renderScale } from '../../model/scale.ts';
import type { Composition } from '../../model/types.ts';
import { initialComposition } from '../../store/composition.ts';
import { SceneSvg } from '../../ui/Canvas.tsx';

function scene(
  format: Composition['format'],
  paletteId: string,
  matches: { objectId: string; count: number }[],
): Composition {
  const placed = composePlacements(matches, {
    format,
    seed: 4,
    withBackgrounds: true,
  });
  return {
    ...initialComposition(),
    format,
    paletteId,
    templateId: placed.templateId,
    scale: placed.scale,
    objects: placed.objects,
  };
}

function raster(markup: string, width: number): Uint8Array {
  const rendered = new Resvg(markup, {
    fitTo: { mode: 'width', value: width },
  }).render();
  return rendered.pixels;
}

function editorMarkup(composition: Composition): string {
  const frame = FORMATS[composition.format];
  const html = renderToStaticMarkup(
    createElement(SceneSvg, {
      format: composition.format,
      size: composition.size,
      scale: renderScale(composition.scale, composition.size),
      palette: resolvePalette(composition.paletteId, []),
      objects: composition.objects,
    }),
  );
  return html.replace(
    '<svg ',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.w}" height="${frame.h}" `,
  );
}

function differingPixels(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length);
  let diff = 0;
  for (let index = 0; index < length; index += 4) {
    const distance =
      Math.abs((left[index] ?? 0) - (right[index] ?? 0)) +
      Math.abs((left[index + 1] ?? 0) - (right[index + 1] ?? 0)) +
      Math.abs((left[index + 2] ?? 0) - (right[index + 2] ?? 0));
    if (distance > 12) diff += 1;
  }
  return diff;
}

describe('export matches the editor', () => {
  const cases: {
    format: Composition['format'];
    paletteId: string;
    matches: { objectId: string; count: number }[];
  }[] = [
    {
      format: 'landscape',
      paletteId: 'lilac',
      matches: [
        { objectId: 'book', count: 1 },
        { objectId: 'phone', count: 1 },
        { objectId: 'puzzle', count: 1 },
      ],
    },
    {
      format: 'square',
      paletteId: 'peach',
      matches: [
        { objectId: 'headphones', count: 1 },
        { objectId: 'flowers', count: 1 },
      ],
    },
    {
      format: 'portrait',
      paletteId: 'teal',
      matches: [
        { objectId: 'lamp', count: 1 },
        { objectId: 'wallet', count: 1 },
        { objectId: 'coin', count: 1 },
      ],
    },
  ];

  it('stays within a small pixel tolerance in every format', () => {
    for (const entry of cases) {
      const composition = scene(entry.format, entry.paletteId, entry.matches);
      const frame = FORMATS[entry.format];
      const exported = raster(exportSvg(composition), frame.w);
      const editor = raster(editorMarkup(composition), frame.w);
      expect(exported.length).toBe(editor.length);
      const diff = differingPixels(exported, editor);
      const pixels = exported.length / 4;
      expect(diff / pixels, entry.format).toBeLessThan(0.002);
    }
  });
});
