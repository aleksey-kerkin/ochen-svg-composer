import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { describe, it } from 'vitest';
import { composePick } from '../src/core/compose.ts';
import { exportSvg } from '../src/core/exportSvg.ts';
import { requestMetaphor } from '../src/core/llm.ts';
import type { ScenePick } from '../src/core/pick.ts';
import { resolvePalette } from '../src/core/recolor.ts';
import { FORMATS } from '../src/model/formats.ts';
import type { Composition, FormatId } from '../src/model/types.ts';

/** Same body as the editor: `{ text, format }` to the deployed compose route. */
const LIVE_COMPOSE = 'https://ochen-svg-composer.vercel.app/api/compose';
const ATTEMPTS = 4;

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

function fromModel(pick: ScenePick): boolean {
  return (
    pick.source === 'model' &&
    typeof pick.model === 'string' &&
    pick.model.length > 0
  );
}

/** Asks production a few times. A tag fallback is kept only after the retries. */
async function livePick(text: string, format: FormatId): Promise<ScenePick> {
  let last: ScenePick | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const pick = await requestMetaphor(text, format, LIVE_COMPOSE);
      last = pick;
      if (fromModel(pick)) return pick;
      console.warn(`${text}: attempt ${attempt} fell back to tags`);
    } catch (error) {
      lastError = error;
      console.warn(`${text}: attempt ${attempt} failed`, error);
    }
  }
  if (last) return last;
  throw lastError instanceof Error ? lastError : new Error('compose failed');
}

describe('example compositions', () => {
  it.skipIf(process.env.EXPORT_EXAMPLES !== '1')(
    'writes exported SVG from the live model',
    async () => {
      mkdirSync('examples', { recursive: true });
      for (const example of examples) {
        const pick = await livePick(example.text, example.format);
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
        const record = {
          slug: example.slug,
          text: example.text,
          source: pick.source,
          model: pick.model ?? null,
          main: pick.main,
          background: pick.background,
          template: pick.template,
          reason: pick.reason,
          objects: placed.objects.map((object) => ({
            id: object.objectId,
            role: object.role,
            x: Math.round(object.x),
            y: Math.round(object.y),
            z: object.z,
          })),
        };
        console.log(JSON.stringify(record));
      }
    },
    180_000,
  );
});
