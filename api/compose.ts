import { composeScene } from '../src/server/composeScene.ts';
import { readNvidiaKey } from '../src/server/readApiKey.ts';
import type { FormatId } from '../src/model/types.ts';

interface NodeResponse {
  status: (code: number) => NodeResponse;
  json: (body: unknown) => void;
}

interface NodeRequest {
  method?: string;
  body?: unknown;
}

const FORMATS = new Set<FormatId>(['landscape', 'square', 'portrait']);

function readInput(body: unknown): { text: string; format: FormatId } | null {
  const record =
    typeof body === 'string' ? (JSON.parse(body) as unknown) : body;
  if (!record || typeof record !== 'object') return null;
  const fields = record as { text?: unknown; format?: unknown };
  if (typeof fields.text !== 'string' || !fields.text.trim()) return null;
  const format = FORMATS.has(fields.format as FormatId)
    ? (fields.format as FormatId)
    : 'landscape';
  return { text: fields.text, format };
}

export default async function handler(req: NodeRequest, res: NodeResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Только POST' });
    return;
  }
  let input: { text: string; format: FormatId } | null;
  try {
    input = readInput(req.body);
  } catch {
    res.status(400).json({ error: 'Нужен JSON' });
    return;
  }
  if (!input) {
    res.status(400).json({ error: 'Нужен текст' });
    return;
  }
  const result = await composeScene(input, {
    apiKey: readNvidiaKey(),
  });
  res.status(200).json(result);
}
