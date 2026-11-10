import type { FormatId } from './types.ts';

/** Frame sizes in pixels. Square and portrait are assumption [A] from the spec. */
export const FORMATS: Record<FormatId, { w: number; h: number }> = {
  landscape: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
};
