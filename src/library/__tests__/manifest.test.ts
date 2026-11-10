import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLOT_ORDER, type Manifest, type Slot } from '../../model/types.ts';

const LILAC: Record<Slot, string> = {
  'bg.base': '#d7cdf5',
  'bg.mid': '#aa9bf0',
  'bg.dark': '#7864d7',
  ink: '#181817',
  'obj.1': '#f9ecb0',
  'obj.2': '#f9a3aa',
  'obj.3': '#ffe3e1',
  paper: '#ffffff',
};

const SCHEME_COLORS: Record<string, Record<Slot, string>> = {
  lilac: LILAC,
  peach: {
    'bg.base': '#fdd7b9',
    'bg.mid': '#fac896',
    'bg.dark': '#d27532',
    ink: '#181817',
    'obj.1': '#f9ecb0',
    'obj.2': '#80dada',
    'obj.3': '#beebeb',
    paper: '#ffffff',
  },
  teal: {
    'bg.base': '#beebeb',
    'bg.mid': '#80dada',
    'bg.dark': '#5abebe',
    ink: '#181817',
    'obj.1': '#ffd4f2',
    'obj.2': '#6d7bfc',
    'obj.3': '#b6c6fe',
    paper: '#ffffff',
  },
};

const BACKGROUND_OBJECT_COLORS = new Set(['#d7cdf5', '#7864d7']);

const OBJECT_IDS = [
  'book',
  'phone',
  'puzzle',
  'coin',
  'headphones',
  'lamp',
  'flowers',
  'wallet',
  'folder',
  'pen',
];

function loadManifest(): Manifest {
  const file = path.join(process.cwd(), 'src/library/manifest.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
}

describe('library manifest', () => {
  it('lists the 10 library objects', () => {
    const manifest = loadManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.items.map((item) => item.objectId)).toEqual(OBJECT_IDS);
  });

  it('gives every object exactly the four S/L × main/background assets', () => {
    const manifest = loadManifest();
    expect(manifest.items).toHaveLength(10);
    for (const item of manifest.items) {
      const keys = item.assets.map((asset) => `${asset.size}:${asset.role}`);
      expect(keys.sort()).toEqual([
        'L:background',
        'L:main',
        'S:background',
        'S:main',
      ]);
    }
  });

  it('gives every object at least three tags', () => {
    const manifest = loadManifest();
    expect(manifest.items).toHaveLength(10);
    for (const item of manifest.items) {
      expect(item.tags.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps every asset color inside the lilac palette', () => {
    const allowed = new Set(Object.values(LILAC));
    const manifest = loadManifest();
    expect(manifest.items).toHaveLength(10);
    for (const item of manifest.items) {
      expect(item.sourceSchemeId).toBe('lilac');
      for (const asset of item.assets) {
        expect(asset.colors.length).toBeGreaterThan(0);
        for (const color of asset.colors) {
          expect(color).toMatch(/^#[0-9a-f]{6}$/);
          expect(allowed.has(color)).toBe(true);
        }
      }
    }
  });

  it('keeps background-object assets on the two lilac background colors', () => {
    const manifest = loadManifest();
    expect(manifest.items).toHaveLength(10);
    const seen = new Set<string>();
    for (const item of manifest.items) {
      for (const asset of item.assets.filter(
        (entry) => entry.role === 'background',
      )) {
        expect(asset.colors.length).toBeGreaterThan(0);
        for (const color of asset.colors) {
          expect(BACKGROUND_OBJECT_COLORS.has(color)).toBe(true);
          seen.add(color);
        }
      }
    }
    expect([...seen].sort()).toEqual([...BACKGROUND_OBJECT_COLORS].sort());
  });

  it('stores svgSize and a viewBox of 0 0 svgSize on every asset', () => {
    const manifest = loadManifest();
    for (const item of manifest.items) {
      for (const asset of item.assets) {
        expect(asset.svgSize.w).toBeGreaterThan(0);
        expect(asset.svgSize.h).toBeGreaterThan(0);
        expect(asset.viewBox).toEqual([0, 0, asset.svgSize.w, asset.svgSize.h]);
        expect(asset.nodeId.length).toBeGreaterThan(0);
        const relative = asset.src.replace(/^\//, '');
        expect(existsSync(path.join(process.cwd(), relative))).toBe(true);
      }
    }
  });

  it('ships the three built-in schemes with eight lower-case slots', () => {
    const manifest = loadManifest();
    expect(manifest.schemes.map((scheme) => scheme.id)).toEqual([
      'lilac',
      'peach',
      'teal',
    ]);
    for (const scheme of manifest.schemes) {
      expect(scheme.colors).toEqual(SCHEME_COLORS[scheme.id]);
      expect(Object.keys(scheme.colors)).toEqual([...SLOT_ORDER]);
      expect(scheme.name.length).toBeGreaterThan(0);
      for (const size of ['L', 'S'] as const) {
        const src = scheme.backgroundAsset[size];
        expect(src).toBe(`/src/assets/backgrounds/${scheme.id}.${size}.svg`);
        expect(existsSync(path.join(process.cwd(), src.slice(1)))).toBe(true);
      }
      for (const color of Object.values(scheme.colors)) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
