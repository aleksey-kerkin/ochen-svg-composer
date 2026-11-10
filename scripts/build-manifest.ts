import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SLOT_ORDER,
  type Hex,
  type LibraryAsset,
  type LibraryItem,
  type Manifest,
  type Role,
  type Scheme,
  type Size,
  type Slot,
} from '../src/model/types.ts';

interface SourceItem {
  objectId: string;
  name: string;
  size: Size;
  role: Role;
  nodeId: string;
  svgSize: { w: number; h: number };
  file: string;
  colors: string[];
}

interface SourcePalette {
  id: string;
  slots: Record<string, string>;
}

interface TagEntry {
  name: { ru: string; en: string };
  synonyms: string[];
  tags: string[];
}

const root = process.cwd();

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as T;
}

function normalizeHex(value: string): Hex {
  const hex = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color: ${value}`);
  }
  return hex as Hex;
}

function requireFile(relativePath: string): void {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(`Missing asset file: ${relativePath}`);
  }
}

function buildItems(
  sourceItems: SourceItem[],
  tags: Record<string, TagEntry>,
): LibraryItem[] {
  const grouped = new Map<string, SourceItem[]>();
  for (const item of sourceItems) {
    const list = grouped.get(item.objectId) ?? [];
    list.push(item);
    grouped.set(item.objectId, list);
  }

  const taggedIds = Object.keys(tags);
  const unknownTags = taggedIds.filter((id) => !grouped.has(id));
  if (unknownTags.length > 0) {
    throw new Error(
      `tags.json has unknown objectId: ${unknownTags.join(', ')}`,
    );
  }

  const items: LibraryItem[] = [];
  for (const [objectId, assets] of grouped) {
    const tag = tags[objectId];
    if (!tag) {
      throw new Error(`Missing tags for objectId: ${objectId}`);
    }
    const sourceName = assets[0]?.name;
    if (tag.name.ru !== sourceName) {
      throw new Error(
        `Russian name mismatch for ${objectId}: tags "${tag.name.ru}", source "${sourceName}"`,
      );
    }
    if (tag.tags.length < 3) {
      throw new Error(`Object ${objectId} needs at least 3 tags`);
    }

    const libraryAssets: LibraryAsset[] = assets.map((asset) => {
      const relative = `src/assets/library/${asset.file}`;
      requireFile(relative);
      return {
        size: asset.size,
        role: asset.role,
        src: `/${relative}`,
        viewBox: [0, 0, asset.svgSize.w, asset.svgSize.h],
        svgSize: { w: asset.svgSize.w, h: asset.svgSize.h },
        nodeId: asset.nodeId,
        colors: asset.colors.map(normalizeHex),
      };
    });

    const pairs = new Set(
      libraryAssets.map((asset) => `${asset.size}:${asset.role}`),
    );
    if (pairs.size !== 4) {
      throw new Error(
        `Object ${objectId} must have 4 assets, got ${pairs.size}`,
      );
    }

    items.push({
      objectId,
      name: tag.name,
      synonyms: tag.synonyms,
      tags: tag.tags,
      sourceSchemeId: 'lilac',
      assets: libraryAssets,
    });
  }

  return items;
}

function buildSchemes(palettes: SourcePalette[]): Scheme[] {
  return palettes.map((palette) => {
    const colors = {} as Record<Slot, Hex>;
    for (const slot of SLOT_ORDER) {
      const value = palette.slots[slot];
      if (!value) {
        throw new Error(`Palette ${palette.id} is missing slot ${slot}`);
      }
      colors[slot] = normalizeHex(value);
    }
    const extra = Object.keys(palette.slots).filter(
      (slot) => !SLOT_ORDER.includes(slot as Slot),
    );
    if (extra.length > 0) {
      throw new Error(
        `Palette ${palette.id} has unknown slots: ${extra.join(', ')}`,
      );
    }

    for (const size of ['L', 'S'] as const) {
      requireFile(`src/assets/backgrounds/${palette.id}.${size}.svg`);
    }

    return {
      id: palette.id,
      name: palette.id,
      colors,
      backgroundAsset: {
        L: `/src/assets/backgrounds/${palette.id}.L.svg`,
        S: `/src/assets/backgrounds/${palette.id}.S.svg`,
      },
    };
  });
}

const source = readJson<{ items: SourceItem[] }>('assets/manifest.json');
const palettes = readJson<{ schemes: SourcePalette[] }>('assets/palettes.json');
const tags = readJson<Record<string, TagEntry>>('src/library/tags.json');

const manifest: Manifest = {
  version: 1,
  items: buildItems(source.items, tags),
  schemes: buildSchemes(palettes.schemes),
};

writeFileSync(
  join(root, 'src/library/manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${manifest.items.length} items and ${manifest.schemes.length} schemes`,
);
