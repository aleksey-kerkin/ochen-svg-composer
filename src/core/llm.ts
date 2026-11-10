import manifestJson from '../library/manifest.json' with { type: 'json' };
import type { FormatId, Manifest } from '../model/types.ts';
import { matchByKeywords } from './match.ts';
import { finishPick, validatePick, type ScenePick } from './pick.ts';

const ids = new Set(
  (manifestJson as Manifest).items.map((item) => item.objectId),
);

/** Local tag pick used when /api/compose cannot be reached. */
export function keywordScene(text: string): ScenePick {
  const items = (manifestJson as Manifest).items;
  return finishPick(matchByKeywords(text, items), 'tags');
}

/** POST /api/compose. The NVIDIA key stays on the server. */
export async function requestMetaphor(
  text: string,
  format: FormatId,
): Promise<ScenePick> {
  const response = await fetch('/api/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, format }),
  });
  if (!response.ok) throw new Error(`compose ${response.status}`);
  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') throw new Error('compose body');
  const record = payload as Record<string, unknown>;
  const validated = validatePick(payload, ids);
  if (!validated || validated.main.length === 0)
    throw new Error('compose pick');
  const source = record.source === 'model' ? 'model' : 'tags';
  const model =
    source === 'model' && typeof record.model === 'string'
      ? record.model
      : undefined;
  return finishPick(
    { ...validated, reason: validated.reason || '' },
    source,
    model,
  );
}
