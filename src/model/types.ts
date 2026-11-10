export type Size = 'S' | 'L';
export type Role = 'main' | 'background';
export type FormatId = 'landscape' | 'square' | 'portrait';

/** Normalized lower-case `#rrggbb`. */
export type Hex = `#${string}`;

/** Palette slot: the role of a color, not the color itself. */
/** Eight swatches from Figma. There is no ninth color. */
export type BgSlot = 'bg.base' | 'bg.mid' | 'bg.dark' | 'ink';
export type ObjSlot = 'obj.1' | 'obj.2' | 'obj.3' | 'paper';
export type Slot = BgSlot | ObjSlot;

export const SLOT_ORDER: Slot[] = [
  'bg.base',
  'bg.mid',
  'bg.dark',
  'ink',
  'obj.1',
  'obj.2',
  'obj.3',
  'paper',
];

/** White appears in the source backgrounds, so the color rule skips it. */
export const RULE_EXEMPT: Slot[] = ['paper'];

export interface Palette {
  id: string;
  name: string;
  colors: Record<Slot, Hex>;
}

/** Built-in scheme: a palette plus the square frame background. */
export interface Scheme extends Palette {
  backgroundAsset: Record<Size, string>;
}

export interface LibraryAsset {
  size: Size;
  role: Role;
  src: string;
  viewBox: [number, number, number, number];
  svgSize: { w: number; h: number };
  nodeId: string;
  colors: Hex[];
}

export interface LibraryItem {
  objectId: string;
  name: { ru: string; en: string };
  synonyms: string[];
  tags: string[];
  sourceSchemeId: 'lilac';
  assets: LibraryAsset[];
}

export type Manifest = { version: 1; items: LibraryItem[]; schemes: Scheme[] };

export interface PlacedObject {
  uid: string;
  objectId: string;
  role: Role;
  x: number;
  y: number;
  rotation: number;
  z: number;
  /** Cycles obj.1–obj.3 on a main object. Ink and paper stay put. */
  colorShift?: 0 | 1 | 2;
}

export interface Composition {
  format: FormatId;
  size: Size;
  paletteId: string;
  /** Absent while the scene is placed by hand. */
  templateId?: LayoutTemplate['id'];
  scale: number;
  objects: PlacedObject[];
  selectedUid?: string;
  seed: number;
}

/** Slot position as a fraction of the frame. Values may fall outside 0..1. */
export interface Slot2D {
  x: number;
  y: number;
  rotation?: number;
}

export interface LayoutTemplate {
  id: 'under-title' | 'offset' | 'compact';
  format: FormatId;
  mainSlots: Slot2D[];
  backgroundSlots: Slot2D[];
  scale: number;
  safeArea?: { x: number; y: number; w: number; h: number };
}
