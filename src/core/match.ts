import type { LibraryItem } from '../model/types.ts';

export interface NameMatch {
  objectId: string;
  count: number;
}

export interface NameQuery {
  matches: NameMatch[];
  unknown: string[];
}

const SUFFIXES = [
  'ами',
  'ями',
  'ого',
  'ему',
  'ою',
  'ею',
  'ий',
  'ый',
  'ая',
  'ое',
  'ов',
  'ев',
  'ам',
  'ям',
  'ах',
  'ях',
  'ом',
  'ем',
  'ой',
  'ей',
  'ию',
  'ью',
  'ия',
  'ья',
  'у',
  'ю',
  'а',
  'я',
  'ы',
  'и',
  'е',
  'о',
];

export function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll('ё', 'е');
}

function stem(value: string): string {
  const word = normalize(value);
  if (word.length <= 4) return word;
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function distance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid: number[] = Array.from({ length: rows * cols }, () => 0);
  for (let row = 0; row < rows; row += 1) grid[row * cols] = row;
  for (let col = 0; col < cols; col += 1) grid[col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      const index = row * cols + col;
      grid[index] = Math.min(
        (grid[index - cols] ?? 0) + 1,
        (grid[index - 1] ?? 0) + 1,
        (grid[index - cols - 1] ?? 0) + cost,
      );
    }
  }
  return grid[rows * cols - 1] ?? 0;
}

function fuzzyLimit(token: string): number {
  if (token.length < 4) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

interface Alias {
  objectId: string;
  text: string;
  stem: string;
}

function aliasesOf(items: LibraryItem[]): Alias[] {
  return items.flatMap((item) => {
    const words = [item.name.ru, item.name.en, ...item.synonyms];
    return words.map((word) => {
      const text = normalize(word);
      return { objectId: item.objectId, text, stem: stem(text) };
    });
  });
}

function unique(ids: string[]): string | undefined {
  const distinct = [...new Set(ids)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

function resolveToken(token: string, aliases: Alias[]): string | undefined {
  const text = normalize(token);
  if (!text) return undefined;
  const exact = unique(
    aliases
      .filter((alias) => alias.text === text)
      .map((alias) => alias.objectId),
  );
  if (exact) return exact;

  const limit = fuzzyLimit(text);
  if (limit > 0) {
    const scored = new Map<string, number>();
    for (const alias of aliases) {
      if (Math.abs(alias.text.length - text.length) > limit) continue;
      const edits = distance(text, alias.text);
      if (edits === 0 || edits > limit) continue;
      const previous = scored.get(alias.objectId);
      if (previous === undefined || edits < previous) {
        scored.set(alias.objectId, edits);
      }
    }
    if (scored.size > 0) {
      const best = Math.min(...scored.values());
      const winners = [...scored.entries()]
        .filter(([, edits]) => edits === best)
        .map(([objectId]) => objectId);
      const winner = unique(winners);
      if (winner) return winner;
    }
  }

  const stemmed = stem(text);
  return unique(
    aliases
      .filter((alias) => alias.stem === stemmed)
      .map((alias) => alias.objectId),
  );
}

function remember(
  matches: NameMatch[],
  objectId: string | undefined,
  count: number,
  raw: string,
  unknown: string[],
) {
  if (!objectId) {
    unknown.push(raw);
    return;
  }
  const existing = matches.find((match) => match.objectId === objectId);
  if (existing) existing.count += count;
  else matches.push({ objectId, count });
}

export function matchByNames(query: string, items: LibraryItem[]): NameQuery {
  const aliases = aliasesOf(items);
  const matches: NameMatch[] = [];
  const unknown: string[] = [];
  const chunks = query
    .split(/\s*(?:,|;|\+)\s*|\s+и\s+/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  for (const chunk of chunks) {
    const counted = /^(\d+)\s+(.+)$/.exec(chunk);
    const count = counted?.[1] ? Number(counted[1]) : 1;
    const text = (counted?.[2] ?? chunk).trim();
    const whole = resolveToken(text, aliases);
    if (whole) {
      remember(matches, whole, Math.max(1, count), text, unknown);
      continue;
    }
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    if (words.length <= 1) {
      remember(matches, undefined, count, text, unknown);
      continue;
    }
    for (const word of words) {
      remember(matches, resolveToken(word, aliases), 1, word, unknown);
    }
  }

  return { matches, unknown };
}

export function libraryItemMatches(item: LibraryItem, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = [
    item.name.ru,
    item.name.en,
    ...item.synonyms,
    ...item.tags,
  ].map((word) => normalize(word));
  return haystack.some((word) => word.includes(needle));
}
