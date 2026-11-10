import { describe, expect, it } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import tags from '../../library/tags.json' with { type: 'json' };
import type { LibraryItem, Manifest } from '../../model/types.ts';
import { libraryItemMatches, matchByNames } from '../match.ts';

const library = manifest as Manifest;
const items = library.items;

function ids(query: string): string[] {
  return matchByNames(query, items).matches.map((match) => match.objectId);
}

describe('tags.json', () => {
  const catalog = tags as Record<
    string,
    { name: { ru: string; en: string }; synonyms: string[]; tags: string[] }
  >;

  it('covers every manifest object and no invented ids', () => {
    expect(Object.keys(catalog).sort()).toEqual(
      items.map((item) => item.objectId).sort(),
    );
    for (const item of items) {
      expect(catalog[item.objectId]?.name.ru).toBe(item.name.ru);
    }
  });

  it('has russian word forms, english synonyms, and the themes for step 8', () => {
    expect(catalog.phone?.synonyms).toEqual(
      expect.arrayContaining(['мобильник', 'смартфон', 'phone']),
    );
    expect(catalog.puzzle?.synonyms).toEqual(
      expect.arrayContaining(['головоломка', 'пазлы']),
    );
    expect(catalog.headphones?.synonyms).toEqual(
      expect.arrayContaining(['гарнитура', 'headphones']),
    );
    expect(catalog.flowers?.synonyms).toEqual(
      expect.arrayContaining(['ваза', 'vase']),
    );
    expect(catalog.wallet?.synonyms).toEqual(
      expect.arrayContaining(['кошелёк', 'wallet']),
    );
    const themes = items.flatMap((item) => item.tags);
    for (const theme of ['финансы', 'учёба', 'музыка', 'работа', 'оплата']) {
      expect(themes).toContain(theme);
    }
  });
});

describe('matchByNames', () => {
  it('finds a book by case, english, and a russian word form', () => {
    expect(ids('книги')).toEqual(['book']);
    expect(ids('Книга')).toEqual(['book']);
    expect(ids('book')).toEqual(['book']);
  });

  it('splits commas, «и», and plus into object ids', () => {
    expect(ids('телефон, пазл')).toEqual(['phone', 'puzzle']);
    expect(ids('книга, телефон и монеты')).toEqual(['book', 'phone', 'coin']);
    expect(ids('наушники + ваза')).toEqual(['headphones', 'flowers']);
  });

  it('counts a leading number and merges a repeated object', () => {
    expect(matchByNames('2 монеты', items).matches).toEqual([
      { objectId: 'coin', count: 2 },
    ]);
    expect(matchByNames('книга и книга', items).matches).toEqual([
      { objectId: 'book', count: 2 },
    ]);
  });

  it('returns unknown words and still keeps the ones it knows', () => {
    const parsed = matchByNames('книга, хрюндель и телефон', items);
    expect(parsed.matches.map((match) => match.objectId)).toEqual([
      'book',
      'phone',
    ]);
    expect(parsed.unknown).toEqual(['хрюндель']);
  });

  it('matches a typo within two edits and treats ё like е', () => {
    expect(ids('телефн')).toEqual(['phone']);
    expect(ids('кошелёк')).toEqual(['wallet']);
    expect(ids('книгк')).toEqual(['book']);
  });

  it('does not invent an object for a short unrelated word', () => {
    const parsed = matchByNames('кот', items);
    expect(parsed.matches).toEqual([]);
    expect(parsed.unknown).toEqual(['кот']);
  });
});

describe('libraryItemMatches', () => {
  it('matches a name fragment and a theme tag', () => {
    const phone = items.find(
      (item) => item.objectId === 'phone',
    ) as LibraryItem;
    const book = items.find((item) => item.objectId === 'book') as LibraryItem;
    expect(libraryItemMatches(phone, 'тел')).toBe(true);
    expect(libraryItemMatches(book, 'тел')).toBe(false);
    expect(libraryItemMatches(book, 'Учёба')).toBe(true);
    expect(libraryItemMatches(phone, '')).toBe(true);
  });
});
