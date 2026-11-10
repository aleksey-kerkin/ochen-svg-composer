import { describe, expect, it, vi } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import { getAsset, getBackgroundAsset } from '../../library/registry.ts';
import type { Manifest, Palette } from '../../model/types.ts';
import { buildColorMap, recolorSvg, validatePaletteUsage } from '../recolor.ts';

const library = manifest as Manifest;

function scheme(id: string): Palette {
  const found = library.schemes.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
}

const LILAC_ONLY = ['#d7cdf5', '#aa9bf0', '#7864d7', '#f9a3aa', '#ffe3e1'];

describe('recolorSvg', () => {
  it('maps lilac slots onto peach instead of the nearest color', () => {
    const map = buildColorMap(scheme('lilac'), scheme('peach'));
    const source = [
      '<path fill="#D7CDF5" stroke="#AA9BF0"/>',
      '<path fill="#7864D7"/>',
      '<path fill="#F9A3AA" stroke="#FFE3E1"/>',
      '<path fill="#F9ECB0"/>',
      '<path fill="#181817" stroke="#FFFFFF"/>',
      '<path style="fill:#D7CDF5;stroke:#181817"/>',
      '<stop stop-color="#AA9BF0"/>',
    ].join('');
    const result = recolorSvg(source, map, 'main');
    expect(result.markup.toLowerCase()).toContain('fill="#fdd7b9"');
    expect(result.markup.toLowerCase()).toContain('stroke="#fac896"');
    expect(result.markup.toLowerCase()).toContain('fill="#d27532"');
    expect(result.markup.toLowerCase()).toContain('fill="#80dada"');
    expect(result.markup.toLowerCase()).toContain('stroke="#beebeb"');
    expect(result.markup.toLowerCase()).toContain('fill="#f9ecb0"');
    expect(result.markup.toLowerCase()).toContain('fill="#181817"');
    expect(result.markup.toLowerCase()).toContain('stroke="#ffffff"');
    expect(result.markup.toLowerCase()).toContain(
      'style="fill:#fdd7b9;stroke:#181817"',
    );
    expect(result.markup.toLowerCase()).toContain('stop-color="#fac896"');
    for (const color of LILAC_ONLY) {
      expect(result.markup.toLowerCase()).not.toContain(color);
    }
    expect(result.unknown).toEqual([]);
  });

  it('leaves url() and unknown colors, and logs the unknown one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = buildColorMap(scheme('lilac'), scheme('teal'));
    const result = recolorSvg(
      '<path fill="url(#grad)" stroke="#123456"/>',
      map,
      'main',
    );
    expect(result.markup).toContain('url(#grad)');
    expect(result.markup).toContain('#123456');
    expect(result.unknown).toEqual(['#123456']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('paints background assets with background slots only', () => {
    const map = buildColorMap(scheme('lilac'), scheme('peach'));
    const asset = getAsset('book', 'L', 'background');
    const result = recolorSvg(asset.inner, map, 'background');
    const markup = result.markup.toLowerCase();
    expect(markup).toContain('#fdd7b9');
    expect(markup).toContain('#d27532');
    expect(markup).not.toContain('#d7cdf5');
    expect(markup).not.toContain('#7864d7');
    expect(markup).not.toContain('#80dada');
    expect(markup).not.toContain('#f9a3aa');
  });

  it('cycles obj.1–obj.3 on a main object and leaves ink and paper', () => {
    const map = buildColorMap(scheme('lilac'), scheme('peach'), 1);
    const result = recolorSvg(
      '<path fill="#F9ECB0"/><path fill="#F9A3AA"/><path fill="#FFE3E1"/><path fill="#181817" stroke="#FFFFFF"/><path fill="#D7CDF5"/>',
      map,
      'main',
    );
    const markup = result.markup.toLowerCase();
    expect(markup).toContain('fill="#80dada"');
    expect(markup).toContain('fill="#beebeb"');
    expect(markup).toContain('fill="#f9ecb0"');
    expect(markup).toContain('fill="#181817"');
    expect(markup).toContain('stroke="#ffffff"');
    expect(markup).toContain('fill="#fdd7b9"');
  });

  it('removes every lilac-only color from a real main object on teal', () => {
    const map = buildColorMap(scheme('lilac'), scheme('teal'));
    const asset = getAsset('phone', 'L', 'main');
    const result = recolorSvg(asset.inner, map, 'main');
    const markup = result.markup.toLowerCase();
    for (const color of [...LILAC_ONLY, '#f9ecb0']) {
      expect(markup).not.toContain(color);
    }
    expect(markup).toContain('#ffd4f2');
  });
});

describe('validatePaletteUsage', () => {
  it('accepts a recolored scene and rejects an object color in the background', () => {
    const peach = scheme('peach');
    const clean = validatePaletteUsage(
      {
        format: 'landscape',
        size: 'L',
        paletteId: 'peach',
        scale: 0.37,
        objects: [
          {
            uid: 'obj-1',
            objectId: 'book',
            role: 'main',
            x: 0,
            y: 0,
            rotation: 0,
            z: 1,
          },
          {
            uid: 'obj-2',
            objectId: 'book',
            role: 'background',
            x: 0,
            y: 0,
            rotation: 0,
            z: 0,
          },
        ],
        seed: 1,
      },
      peach,
    );
    expect(clean).toEqual([]);

    const leaked = validatePaletteUsage(
      {
        format: 'landscape',
        size: 'L',
        paletteId: 'peach',
        scale: 0.37,
        objects: [],
        seed: 1,
      },
      peach,
      [
        {
          kind: 'frame',
          markup: getBackgroundAsset('peach', 'L').inner,
        },
        {
          kind: 'object',
          role: 'background',
          markup: '<path fill="#80DADA"/>',
        },
        {
          kind: 'object',
          role: 'background',
          markup: '<path fill="#FFFFFF"/>',
        },
        { kind: 'object', role: 'main', markup: '<path fill="#80DADA"/>' },
      ],
    );
    expect(leaked.map((item) => item.color.toLowerCase())).toEqual(['#80dada']);
    expect(leaked[0]?.where).toBe('background');
  });
});
