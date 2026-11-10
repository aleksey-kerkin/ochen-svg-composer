import { describe, expect, it } from 'vitest';
import { parsePaletteInput, validatePalette } from '../palette.ts';

const LINES = [
  '#112233',
  '#223344',
  '#334455',
  '#181817',
  '#aabbcc',
  '#bbccdd',
  '#ccddee',
  '#ffffff',
].join('\n');

describe('validatePalette', () => {
  it('requires eight slots and keeps object colors out of the background', () => {
    const parsed = parsePaletteInput(LINES);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.palette.colors['bg.base']).toBe('#112233');
    expect(parsed.palette.colors.paper).toBe('#ffffff');
    expect(parsed.palette.name.length).toBeGreaterThan(0);

    const short = validatePalette({
      'bg.base': '#112233',
      'bg.mid': '#223344',
      'bg.dark': '#334455',
      ink: '#181817',
      'obj.1': '#aabbcc',
      'obj.2': '#bbccdd',
      'obj.3': '#ccddee',
    });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toMatch(/8/);

    const leaked = validatePalette({
      'bg.base': '#112233',
      'bg.mid': '#223344',
      'bg.dark': '#334455',
      ink: '#181817',
      'obj.1': '#112233',
      'obj.2': '#bbccdd',
      'obj.3': '#ccddee',
      paper: '#ffffff',
    });
    expect(leaked.ok).toBe(false);
    if (!leaked.ok) expect(leaked.error).toMatch(/obj\.1/);

    const inkClash = validatePalette({
      'bg.base': '#112233',
      'bg.mid': '#223344',
      'bg.dark': '#334455',
      ink: '#181817',
      'obj.1': '#aabbcc',
      'obj.2': '#181817',
      'obj.3': '#ccddee',
      paper: '#ffffff',
    });
    expect(inkClash.ok).toBe(false);

    const paperOnBase = validatePalette({
      'bg.base': '#ffffff',
      'bg.mid': '#223344',
      'bg.dark': '#334455',
      ink: '#181817',
      'obj.1': '#aabbcc',
      'obj.2': '#bbccdd',
      'obj.3': '#ccddee',
      paper: '#ffffff',
    });
    expect(paperOnBase.ok).toBe(true);
  });

  it('reads a JSON palette and rejects a bad hex', () => {
    const json = JSON.stringify({
      name: 'Ночь',
      colors: {
        'bg.base': '#010203',
        'bg.mid': '#112233',
        'bg.dark': '#223344',
        ink: '#000000',
        'obj.1': '#abcdef',
        'obj.2': '#fedcba',
        'obj.3': '#123456',
        paper: '#fff',
      },
    });
    const parsed = parsePaletteInput(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.palette.name).toBe('Ночь');
    expect(parsed.palette.colors.paper).toBe('#ffffff');

    const bad = parsePaletteInput(
      '{"name":"Плохо","colors":{"bg.base":"red"}}',
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.length).toBeGreaterThan(0);
  });
});
