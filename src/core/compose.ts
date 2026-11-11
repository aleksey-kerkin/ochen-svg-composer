import type { FormatId, PlacedObject, Size } from '../model/types.ts';
import { ensureBackdrop } from './backdrop.ts';
import type { NameMatch } from './match.ts';
import { layoutScene, templateById, type TemplateId } from './layout.ts';

export interface ComposeOptions {
  format: FormatId;
  templateId?: TemplateId;
  seed: number;
  /** Default L. S and L pick the low and high end of the group fill. */
  size?: Size;
  /** Default on. Off keeps only the named main objects. */
  withBackgrounds?: boolean;
}

export interface ComposedScene {
  templateId: TemplateId;
  scale: number;
  objects: PlacedObject[];
}

function expand(matches: NameMatch[]): PlacedObject[] {
  const objects: PlacedObject[] = [];
  for (const match of matches) {
    const count = Math.max(1, match.count);
    for (let index = 0; index < count; index += 1) {
      objects.push({
        uid: `obj-${objects.length + 1}`,
        objectId: match.objectId,
        role: 'main',
        x: 0,
        y: 0,
        rotation: 0,
        z: 0,
      });
    }
  }
  return objects;
}

function chooseTemplate(
  count: number,
  format: FormatId,
  active?: TemplateId,
): TemplateId {
  const capacity = (id: TemplateId) =>
    templateById(id, format).mainSlots.length;
  if (active && capacity(active) >= count) return active;
  if (count <= 1) return 'under-title';
  return 'compact';
}

/** Named objects stay main. Backgrounds are extra monochrome companions. */
export function composePlacements(
  matches: NameMatch[],
  options: ComposeOptions,
): ComposedScene {
  const expanded = expand(matches);
  const templateId = chooseTemplate(
    expanded.length,
    options.format,
    options.templateId,
  );
  const template = templateById(templateId, options.format);
  const named = expanded.map((object, index) => ({
    ...object,
    role: 'main' as const,
    z: expanded.length - index,
  }));
  const objects =
    options.withBackgrounds === false
      ? named
      : ensureBackdrop(named, options.format);
  const scene = layoutScene(
    objects,
    template,
    options.seed,
    options.size ?? 'L',
  );
  return {
    templateId,
    scale: scene.scale,
    objects: scene.objects,
  };
}

/** Lays out a metaphor pick. Backgrounds are only those the pick named. */
export function composePick(
  pick: { main: string[]; background: string[]; template: TemplateId },
  options: { format: FormatId; seed: number; size?: Size },
): ComposedScene {
  const template = templateById(pick.template, options.format);
  const objects: PlacedObject[] = [];
  for (const objectId of pick.main) {
    objects.push({
      uid: `obj-${objects.length + 1}`,
      objectId,
      role: 'main',
      x: 0,
      y: 0,
      rotation: 0,
      z: pick.main.length - objects.length,
    });
  }
  for (const objectId of pick.background) {
    objects.push({
      uid: `obj-${objects.length + 1}`,
      objectId,
      role: 'background',
      x: 0,
      y: 0,
      rotation: 0,
      z: 0,
    });
  }
  const scene = layoutScene(
    objects,
    template,
    options.seed,
    options.size ?? 'L',
  );
  return {
    templateId: pick.template,
    scale: scene.scale,
    objects: scene.objects,
  };
}
