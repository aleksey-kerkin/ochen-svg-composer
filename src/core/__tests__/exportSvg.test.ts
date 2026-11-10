/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { composePlacements } from '../compose.ts';
import { exportFileName, exportSvg } from '../exportSvg.ts';
import { getAsset } from '../../library/registry.ts';
import manifest from '../../library/manifest.json' with { type: 'json' };
import { FORMATS } from '../../model/formats.ts';
import { renderScale } from '../../model/scale.ts';
import { SLOT_ORDER } from '../../model/types.ts';
import type {
  Composition,
  Hex,
  Manifest,
  Palette,
  PlacedObject,
} from '../../model/types.ts';
import { initialComposition } from '../../store/composition.ts';
import { normalizeHex, resolvePalette } from '../recolor.ts';

const library = manifest as Manifest;

function scene(
  format: Composition['format'],
  paletteId: string,
  matches: { objectId: string; count: number }[],
): Composition {
  const placed = composePlacements(matches, {
    format,
    seed: 3,
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

function parse(markup: string): Document {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

function elements(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

function geometry(markup: string): string[] {
  const doc = parse(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
  return elements(doc, 'path, rect, line, polygon, polyline').map((node) => {
    if (node.tagName === 'path') return `path:${node.getAttribute('d')}`;
    if (node.tagName === 'rect') {
      return `rect:${node.getAttribute('x')},${node.getAttribute('y')},${node.getAttribute('width')},${node.getAttribute('height')}`;
    }
    if (node.tagName === 'line') {
      return `line:${node.getAttribute('x1')},${node.getAttribute('y1')},${node.getAttribute('x2')},${node.getAttribute('y2')}`;
    }
    return `${node.tagName}:${node.getAttribute('points')}`;
  });
}

function colorsOf(node: Element): Hex[] {
  const found: Hex[] = [];
  const take = (value: string | null) => {
    if (!value) return;
    const hex = normalizeHex(value.trim());
    if (hex) found.push(hex);
  };
  for (const element of [node, ...elements(node, '*')]) {
    take(element.getAttribute('fill'));
    take(element.getAttribute('stroke'));
    take(element.getAttribute('stop-color'));
  }
  return found;
}

function paletteColors(palette: Palette): Set<Hex> {
  return new Set(
    SLOT_ORDER.map((slot) => normalizeHex(palette.colors[slot])).filter(
      (color): color is Hex => color !== null,
    ),
  );
}

function forbiddenBackgroundColors(palette: Palette): Set<Hex> {
  const background = new Set(
    (['bg.base', 'bg.mid', 'bg.dark', 'ink'] as const)
      .map((slot) => normalizeHex(palette.colors[slot]))
      .filter((color): color is Hex => color !== null),
  );
  const objects = (['obj.1', 'obj.2', 'obj.3'] as const)
    .map((slot) => normalizeHex(palette.colors[slot]))
    .filter((color): color is Hex => color !== null && !background.has(color));
  return new Set(objects);
}

function expectDocument(markup: string, composition: Composition) {
  const doc = parse(markup);
  const root = doc.documentElement;
  const frame = FORMATS[composition.format];
  expect(root.tagName).toBe('svg');
  expect(root.getAttribute('viewBox')).toBe(`0 0 ${frame.w} ${frame.h}`);
  expect(root.getAttribute('width')).toBe(String(frame.w));
  expect(root.getAttribute('height')).toBe(String(frame.h));
  expect(markup).not.toMatch(/<use[\s>]/);
  expect(markup).not.toMatch(/<image[\s>]/);
  expect(markup).not.toMatch(/foreignObject/);
  expect(markup).not.toMatch(/data:image/);
  expect(markup).not.toMatch(/data-selection/);
  expect(doc.querySelector('clipPath#frame-clip')).toBeTruthy();
  const compositionGroup = doc.querySelector('g#composition');
  expect(compositionGroup?.getAttribute('data-name')).toBe('composition');
  expect(compositionGroup?.getAttribute('clip-path')).toBe('url(#frame-clip)');
  expect(root.getAttribute('fill')).toBe('none');
  expect(root.getAttribute('style')).toBeNull();

  const ids = elements(doc, '[id]').map((node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    expect(id, id).toMatch(/^[A-Za-z0-9_-]+$/);
  }

  const groups = elements(doc, 'g[data-object]');
  expect(groups.map((node) => node.getAttribute('data-object')).sort()).toEqual(
    composition.objects.map((object) => object.objectId).sort(),
  );
  const drawn = renderScale(composition.scale, composition.size);
  for (const group of groups) {
    expect(group.getAttribute('transform')).toContain(`scale(${drawn})`);
    const role = group.getAttribute('data-role');
    const objectId = group.getAttribute('data-object');
    const name = library.items.find((item) => item.objectId === objectId)?.name
      .ru;
    expect(group.getAttribute('data-name')).toBe(`${name} · ${role}`);
    const object = composition.objects.find(
      (entry) => entry.objectId === objectId && group.id.includes(entry.uid),
    );
    expect(object).toBeDefined();
    const source = getAsset(objectId!, composition.size, object!.role);
    expect(geometry(group.innerHTML)).toEqual(geometry(source.inner));
  }

  const palette = resolvePalette(composition.paletteId, []);
  const allowed = paletteColors(palette);
  const forbidden = forbiddenBackgroundColors(palette);
  const painted = elements(doc, '[fill],[stroke],[stop-color]');
  for (const node of painted) {
    for (const color of [
      node.getAttribute('fill'),
      node.getAttribute('stroke'),
      node.getAttribute('stop-color'),
    ]) {
      const hex = color ? normalizeHex(color) : null;
      if (!hex) continue;
      expect(allowed.has(hex), hex).toBe(true);
    }
  }
  const quiet = elements(
    doc,
    '[data-role="background"], [data-layer="background"]',
  );
  for (const node of quiet) {
    for (const color of colorsOf(node)) {
      expect(forbidden.has(color), color).toBe(false);
    }
  }
}

describe('exportSvg', () => {
  it('exports a landscape scene with baked colors and the original paths', () => {
    const composition = scene('landscape', 'lilac', [
      { objectId: 'book', count: 1 },
      { objectId: 'phone', count: 1 },
      { objectId: 'puzzle', count: 1 },
    ]);
    expectDocument(exportSvg(composition), composition);
  });

  it('exports square and portrait scenes in their own palettes', () => {
    const square = scene('square', 'peach', [
      { objectId: 'headphones', count: 1 },
      { objectId: 'flowers', count: 1 },
    ]);
    const portrait = scene('portrait', 'teal', [
      { objectId: 'lamp', count: 1 },
      { objectId: 'wallet', count: 1 },
      { objectId: 'coin', count: 1 },
    ]);
    expectDocument(exportSvg(square), square);
    expectDocument(exportSvg(portrait), portrait);
    const small = {
      ...scene('square', 'peach', [{ objectId: 'pen', count: 1 }]),
      size: 'S' as const,
    };
    expectDocument(exportSvg(small), small);
  });

  it('keeps path data when a main object cycles colors, and keeps duplicate ids unique', () => {
    const base = scene('landscape', 'lilac', [{ objectId: 'book', count: 1 }]);
    const book = base.objects.find((object) => object.objectId === 'book');
    if (!book) throw new Error('missing book');
    const shifted: PlacedObject = { ...book, colorShift: 1 };
    const copy: PlacedObject = {
      ...book,
      uid: 'obj-copy',
      x: book.x + 40,
      z: book.z + 1,
    };
    const composition = { ...base, objects: [shifted, copy] };
    const markup = exportSvg(composition);
    expectDocument(markup, composition);
    const plain = exportSvg({ ...base, objects: [book] });
    const fillsOf = (source: string, uid: string) => {
      const doc = parse(source);
      const group = elements(doc, 'g[data-object]').find((node) =>
        node.id.includes(uid),
      );
      return (group ? elements(group, '[fill]') : [])
        .map((node) => node.getAttribute('fill'))
        .join('|');
    };
    expect(fillsOf(markup, book.uid)).not.toBe(fillsOf(plain, book.uid));
  });

  it('names the file from the format and date, or from a title', () => {
    const date = new Date('2026-11-10T12:00:00Z');
    expect(exportFileName({ format: 'portrait', date })).toBe(
      'portrait-2026-11-10.svg',
    );
    expect(
      exportFileName({ format: 'square', title: 'Учёба онлайн', date }),
    ).toBe('учёба-онлайн-2026-11-10.svg');
  });
});
