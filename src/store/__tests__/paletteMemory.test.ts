/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { PALETTE_KEY, parsePaletteMemory } from '../paletteMemory.ts';
import { useComposition } from '../useComposition.ts';

const eight = {
  'bg.base': '#112233',
  'bg.mid': '#223344',
  'bg.dark': '#334455',
  ink: '#181817',
  'obj.1': '#aabbcc',
  'obj.2': '#bbccdd',
  'obj.3': '#ccddee',
  paper: '#ffffff',
};

describe('palette memory', () => {
  it('keeps a valid custom palette and the selected scheme', () => {
    const memory = parsePaletteMemory(
      JSON.stringify({
        paletteId: 'peach',
        customPalettes: [
          { id: 'custom-1', name: 'Ночь', colors: eight },
          { id: 'custom-2', name: 'Битая', colors: { 'bg.base': '#112233' } },
        ],
      }),
    );
    expect(memory?.paletteId).toBe('peach');
    expect(memory?.customPalettes).toHaveLength(1);
    expect(memory?.customPalettes[0]?.colors['obj.1']).toBe('#aabbcc');
  });

  it('drops a payload that is not JSON or has no usable palette', () => {
    expect(parsePaletteMemory('not json')).toBeNull();
    expect(
      parsePaletteMemory(JSON.stringify({ paletteId: 'nope' })),
    ).toBeNull();
  });

  it('writes the chosen scheme and restores it on the next read', () => {
    localStorage.clear();
    useComposition.setState(useComposition.getInitialState(), true);
    useComposition.getState().setPalette('peach');
    const raw = localStorage.getItem(PALETTE_KEY);
    expect(parsePaletteMemory(raw)?.paletteId).toBe('peach');
    useComposition.getState().addPalette(Object.values(eight).join(' '));
    const saved = parsePaletteMemory(localStorage.getItem(PALETTE_KEY));
    expect(saved?.customPalettes).toHaveLength(1);
    expect(saved?.paletteId).toBe(saved?.customPalettes[0]?.id);
  });
});
