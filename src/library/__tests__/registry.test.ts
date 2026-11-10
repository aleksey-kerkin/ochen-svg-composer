import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getAsset,
  getBackgroundAsset,
  prefixSvgIds,
  scopeAsset,
} from '../registry.ts';

function collectIds(markup: string): string[] {
  return [...markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('prefixSvgIds', () => {
  it('prefixes ids and url() or href references without merging longer ids', () => {
    const source = [
      '<g id="Vector_2" clip-path="url(#clip0_0_4)">',
      '<path id="Vector" fill="url(\'#Vector\')" />',
      '<use href="#Vector_2" xlink:href="#Vector" />',
      '<path id="Vector 2" />',
      '</g>',
      '<clipPath id="clip0_0_4"></clipPath>',
    ].join('');

    const prefixed = prefixSvgIds(source, 'book-L-main-');

    expect(prefixed).toContain('id="book-L-main-Vector_2"');
    expect(prefixed).toContain('id="book-L-main-Vector"');
    expect(prefixed).toContain('id="book-L-main-Vector 2"');
    expect(prefixed).toContain('url(#book-L-main-clip0_0_4)');
    expect(prefixed).toContain("url('#book-L-main-Vector')");
    expect(prefixed).toContain('href="#book-L-main-Vector_2"');
    expect(prefixed).toContain('xlink:href="#book-L-main-Vector"');
    expect(prefixed).not.toContain('url(#clip0_0_4)');
    expect(prefixed).not.toContain('id="Vector"');
    expect(prefixed).not.toContain('href="#Vector_2"');
  });
});

describe('registry assets', () => {
  it('returns the svg inner with ids prefixed by object, size, and role', () => {
    const asset = getAsset('coin', 'S', 'background');
    expect(asset.inner).not.toMatch(/<svg[\s>]/);
    const ids = collectIds(asset.inner);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.startsWith('coin-S-background-')).toBe(true);
    }
  });

  it('keeps path data and the manifest viewBox', () => {
    const raw = readFileSync('src/assets/library/L/main/book.svg', 'utf8');
    const pathData = raw.match(/\sd="([^"]+)"/)?.[1];
    const asset = getAsset('book', 'L', 'main');
    expect(pathData).toBeTruthy();
    expect(asset.inner).toContain(`d="${pathData}"`);
    expect(asset.svgSize).toEqual({ w: 1445.89, h: 976.664 });
    expect(asset.viewBox).toEqual([0, 0, 1445.89, 976.664]);
  });

  it('scopes a second prefix by uid so two copies do not share ids', () => {
    const asset = getAsset('book', 'L', 'main');
    const first = scopeAsset(asset, 'obj-1');
    const second = scopeAsset(asset, 'obj-2');
    const ids = [...collectIds(first.inner), ...collectIds(second.inner)];
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.inner).toContain('id="obj-1-book-L-main-');
    expect(second.inner).toContain('id="obj-2-book-L-main-');
  });

  it('prefixes both peach backgrounds so clip0_0_4 is not shared', () => {
    const large = getBackgroundAsset('peach', 'L');
    const small = getBackgroundAsset('peach', 'S');
    const ids = [...collectIds(large.inner), ...collectIds(small.inner)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(large.inner).toContain('url(#bg-peach-L-clip0_0_4)');
    expect(small.inner).toContain('url(#bg-peach-S-clip0_0_4)');
    expect(large.inner).not.toContain('url(#clip0_0_4)');
    expect(small.inner).not.toContain('url(#clip0_0_4)');
    expect(large.svgSize).toEqual({ w: 1000, h: 1000 });
    expect(small.svgSize).toEqual({ w: 500, h: 500 });
  });

  it('throws a clear error when the object is missing', () => {
    expect(() => getAsset('dragon', 'L', 'main')).toThrow(/dragon/);
  });

  it('returns the same cached asset for the same key', () => {
    expect(getAsset('lamp', 'L', 'main')).toBe(getAsset('lamp', 'L', 'main'));
  });
});
