import type { LayoutTemplate } from '../model/types.ts';

export type TemplateId = LayoutTemplate['id'];

export const MAIN_LIMIT = 3;
export const BACKGROUND_LIMIT = 2;

const TEMPLATES = new Set<TemplateId>(['under-title', 'offset', 'compact']);

export interface ValidatedPick {
  main: string[];
  background: string[];
  template?: TemplateId;
  reason: string;
}

export interface ScenePick {
  main: string[];
  background: string[];
  template: TemplateId;
  source: 'model' | 'tags';
  model?: string;
  reason: string;
}

export function templateForCount(count: number): TemplateId {
  if (count <= 1) return 'under-title';
  if (count === 2) return 'offset';
  return 'compact';
}

function cleanIds(
  value: unknown,
  ids: ReadonlySet<string>,
  limit: number,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !ids.has(entry) || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
    if (result.length >= limit) break;
  }
  return result;
}

/** Drops unknown ids, duplicates, and anything past the library limits. */
export function validatePick(
  value: unknown,
  ids: ReadonlySet<string>,
): ValidatedPick | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const template = TEMPLATES.has(record.template as TemplateId)
    ? (record.template as TemplateId)
    : undefined;
  const reason =
    typeof record.reason === 'string' ? record.reason.trim().slice(0, 200) : '';
  return {
    main: cleanIds(record.main, ids, MAIN_LIMIT),
    background: cleanIds(record.background, ids, BACKGROUND_LIMIT),
    ...(template ? { template } : {}),
    reason,
  };
}

/** Pulls the first JSON object out of a model reply, including a fenced block. */
export function parseModelContent(content: unknown): unknown {
  if (typeof content !== 'string') return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export function finishPick(
  pick: ValidatedPick,
  source: ScenePick['source'],
  model?: string,
): ScenePick {
  const scene: ScenePick = {
    main: pick.main,
    background: pick.background,
    template: pick.template ?? templateForCount(pick.main.length),
    source,
    reason: pick.reason,
  };
  if (source === 'model' && model) scene.model = model;
  return scene;
}
