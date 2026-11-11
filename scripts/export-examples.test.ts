import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { describe, it } from 'vitest';
import { composeScene } from '../src/server/composeScene.ts';
import { composePick } from '../src/core/compose.ts';
import { exportSvg } from '../src/core/exportSvg.ts';
import { resolvePalette } from '../src/core/recolor.ts';
import { FORMATS } from '../src/model/formats.ts';
import type { Composition, FormatId } from '../src/model/types.ts';

const examples: {
  slug: string;
  text: string;
  format: FormatId;
  paletteId: string;
}[] = [
  {
    slug: 'ucheba-landscape-lilac',
    text: 'учёба',
    format: 'landscape',
    paletteId: 'lilac',
  },
  {
    slug: 'dengi-square-peach',
    text: 'деньги',
    format: 'square',
    paletteId: 'peach',
  },
  {
    slug: 'office-portrait-teal',
    text: 'работа в офисе',
    format: 'portrait',
    paletteId: 'teal',
  },
];

describe('example compositions', () => {
  it.skipIf(process.env.EXPORT_EXAMPLES !== '1')(
    'writes exported SVG from the tag fallback',
    async () => {
      mkdirSync('examples', { recursive: true });
      for (const example of examples) {
        const pick = await composeScene(
          { text: example.text, format: example.format },
          {},
        );
        if (pick.source !== 'tags') {
          throw new Error(
            `${example.slug} used ${pick.source}, expected the tag fallback`,
          );
        }
        const placed = composePick(pick, { format: example.format, seed: 1 });
        const composition: Composition = {
          format: example.format,
          size: 'L',
          paletteId: example.paletteId,
          templateId: placed.templateId,
          scale: placed.scale,
          objects: placed.objects,
          seed: 1,
          withBackgrounds: placed.objects.some(
            (object) => object.role === 'background',
          ),
        };
        const markup = exportSvg(
          composition,
          resolvePalette(example.paletteId, []),
        );
        const png = new Resvg(markup, {
          fitTo: { mode: 'width', value: FORMATS[example.format].w },
        })
          .render()
          .asPng();
        writeFileSync(`examples/${example.slug}.svg`, markup);
        writeFileSync(`examples/${example.slug}.png`, png);
        console.log(
          example.slug,
          pick.main.join('+'),
          'bg',
          pick.background.join('+') || '—',
          pick.template,
        );
      }
    },
  );
});
