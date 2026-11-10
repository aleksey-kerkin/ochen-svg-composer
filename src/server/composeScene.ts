import manifestJson from '../library/manifest.json' with { type: 'json' };
import type { FormatId, LibraryItem, Manifest } from '../model/types.ts';
import { matchByKeywords } from '../core/match.ts';
import {
  ensureMainPair,
  finishPick,
  parseModelContent,
  validatePick,
  type ScenePick,
} from '../core/pick.ts';

export const NVIDIA_URL =
  'https://integrate.api.nvidia.com/v1/chat/completions';
export const PRIMARY_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
export const FALLBACK_MODEL = 'z-ai/glm-5.3-flash';
export const MODEL_TIMEOUT_MS = 9_000;

const FORMAT_LABEL: Record<FormatId, string> = {
  landscape: 'горизонталь',
  square: 'квадрат',
  portrait: 'вертикаль',
};

export interface ComposeInput {
  text: string;
  format: FormatId;
}

export interface ComposeDeps {
  apiKey?: string;
  fetch?: typeof fetch;
  items?: LibraryItem[];
  timeoutMs?: number;
}

function catalog(items: LibraryItem[]): string {
  return items
    .map(
      (item) => `${item.objectId} | ${item.name.ru} | ${item.tags.join(', ')}`,
    )
    .join('\n');
}

function systemPrompt(items: LibraryItem[]): string {
  return [
    'Ты подбираешь объекты для иллюстрации из фиксированной библиотеки.',
    'Можно использовать только id из списка. Не придумывай объекты и не описывай SVG.',
    'Выбери от 2 до 4 главных id, которые передают смысл заголовка или метафоры.',
    'Один объект — слишком мало: деньги это wallet и coin, учёба это book и pen.',
    'Фоновые id — от 0 до 2. Это монохромный задний план. Если фон не нужен, оставь background пустым.',
    'Не повторяй id внутри одного списка. Шаблон: under-title, offset или compact.',
    'Ответь одним JSON без пояснений:',
    '{"main":["book"],"background":["lamp"],"template":"compact","reason":"кратко"}',
    'Каталог (id | название | теги):',
    catalog(items),
  ].join('\n');
}

function tagsPick(text: string, items: LibraryItem[]): ScenePick {
  const picked = matchByKeywords(text, items);
  return finishPick(picked, 'tags');
}

async function askModel(
  model: string,
  input: ComposeInput,
  items: LibraryItem[],
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<ScenePick> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      { role: 'system', content: systemPrompt(items) },
      {
        role: 'user',
        content: `Заголовок: «${input.text.slice(0, 400)}». Формат: ${FORMAT_LABEL[input.format]}.`,
      },
    ],
  };
  if (model === PRIMARY_MODEL) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  const response = await fetchFn(NVIDIA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`model status ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const parsed = parseModelContent(payload.choices?.[0]?.message?.content);
  const ids = new Set(items.map((item) => item.objectId));
  const validated = parsed ? validatePick(parsed, ids) : null;
  if (!validated || validated.main.length === 0) {
    throw new Error('empty pick');
  }
  return finishPick(
    ensureMainPair(validated, input.text, items),
    'model',
    model,
  );
}

/** Asks the primary model, then the fallback, then picks by tags. */
export async function composeScene(
  input: ComposeInput,
  deps: ComposeDeps = {},
): Promise<ScenePick> {
  const items = deps.items ?? (manifestJson as Manifest).items;
  const text = input.text.trim();
  if (!text) return tagsPick(text, items);
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return tagsPick(text, items);
  const fetchFn = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? MODEL_TIMEOUT_MS;
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      return await askModel(
        model,
        { ...input, text },
        items,
        apiKey,
        fetchFn,
        timeoutMs,
      );
    } catch {
      // Try the next model, then the tag picker.
    }
  }
  return tagsPick(text, items);
}
