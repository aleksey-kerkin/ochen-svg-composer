import { FORMATS } from '../model/formats.ts';
import type { FormatId, PlacedObject } from '../model/types.ts';
import type { NameMatch } from './match.ts';
import { layout, templateById, type TemplateId } from './layout.ts';

const TEMPLATE_ORDER: TemplateId[] = ['under-title', 'offset', 'compact'];

export interface ComposeOptions {
  format: FormatId;
  templateId?: TemplateId;
  seed: number;
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
  return TEMPLATE_ORDER.find((id) => capacity(id) >= count) ?? 'compact';
}

/** First objects take main slots. The rest become background and stay in the scene. */
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
  const assigned = expanded.map((object, index) => ({
    ...object,
    role:
      index < template.mainSlots.length
        ? ('main' as const)
        : ('background' as const),
    z: expanded.length - index,
  }));
  const placed = layout(assigned, template, options.seed);
  const frame = FORMATS[options.format];
  const overflow = assigned
    .filter((object) => !placed.some((entry) => entry.uid === object.uid))
    .map((object, index) => ({
      ...object,
      role: 'background' as const,
      x: frame.w * 0.5 + index * 36,
      y: frame.h * 0.5 + index * 36,
      z: -1 - index,
    }));
  return {
    templateId,
    scale: template.scale,
    objects: [...placed, ...overflow],
  };
}
