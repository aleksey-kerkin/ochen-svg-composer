import { resolvePalette } from '../core/recolor.ts';
import type { Palette, Size } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';

/** Size and the palette the canvas and library both paint with. */
export function useScenePalette(): { size: Size; palette: Palette } {
  const size = useComposition((state) => state.size);
  const paletteId = useComposition((state) => state.paletteId);
  const customPalettes = useComposition((state) => state.customPalettes);
  return { size, palette: resolvePalette(paletteId, customPalettes) };
}
