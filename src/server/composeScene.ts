import manifestJson from '../library/manifest.json' with { type: 'json' };
import type { FormatId, LibraryItem, Manifest } from '../model/types.ts';
import { matchByKeywords } from '../core/match.ts';
import {
  ensureMainPair,
  finishPick,
  parseModelMessage,
  validatePick,
  type ScenePick,
} from '../core/pick.ts';

export const NVIDIA_URL =
  'https://integrate.api.nvidia.com/v1/chat/completions';

/** Preferred models first, then reserves that answered within a few seconds. */
export const DEFAULT_MODELS = [
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'z-ai/glm-5.3-flash',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'stepfun-ai/step-5-preview',
  'minimaxai/minimax-m3.1-flash',
] as const;

export const PRIMARY_MODEL = DEFAULT_MODELS[0];
export const FALLBACK_MODEL = DEFAULT_MODELS[1];

const MODEL_TIMEOUT_MS = 4_000;
const COMPOSE_DEADLINE_MS = 10_000;
const MIN_ATTEMPT_MS = 250;
const TIMEOUT_COOLDOWN_MS = 60_000;
const ANSWER_TOKENS = 400;
const REASONING_TOKENS = 1_600;

const FORMAT_LABEL: Record<FormatId, string> = {
  landscape: 'горизонталь',
  square: 'квадрат',
  portrait: 'вертикаль',
};

const cooledUntil = new Map<string, number>();

/** Drops the in-memory skip list. Tests use this; a cold start starts empty. */
export function clearModelCooldowns(): void {
  cooledUntil.clear();
}

/** `NVIDIA_MODELS` is a comma list. Blank means the built-in chain. */
export function modelChain(override?: string): string[] {
  const parsed = (override ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_MODELS];
}

export interface ComposeInput {
  text: string;
  format: FormatId;
}

export interface ComposeDeps {
  apiKey?: string;
  fetch?: typeof fetch;
  items?: LibraryItem[];
  /** Per-model cap. The default is 4 seconds. */
  timeoutMs?: number;
  /** Stop the chain and use tags after this. The default is 10 seconds. */
  deadlineMs?: number;
  /** Replaces `NVIDIA_MODELS` and the built-in list when non-empty. */
  models?: readonly string[];
  /** How long a timed-out model stays skipped in this process. Default 60s. */
  cooldownMs?: number;
}

class ModelTimeoutError extends Error {
  constructor() {
    super('model timeout');
    this.name = 'ModelTimeoutError';
  }
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

function chainFor(deps: ComposeDeps): string[] {
  const explicit = deps.models
    ?.map((model) => model.trim())
    .filter((model) => model.length > 0);
  if (explicit && explicit.length > 0) return explicit;
  return modelChain(process.env.NVIDIA_MODELS);
}

function cooling(model: string, at: number): boolean {
  const until = cooledUntil.get(model);
  if (until === undefined) return false;
  if (until <= at) {
    cooledUntil.delete(model);
    return false;
  }
  return true;
}

function rememberTimeout(model: string, cooldownMs: number): void {
  cooledUntil.set(model, Date.now() + cooldownMs);
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return (
    name === 'ModelTimeoutError' ||
    name === 'TimeoutError' ||
    name === 'AbortError'
  );
}

/** Turns reasoning off where the NVIDIA API documents the switch. */
function tuneBody(model: string, body: Record<string, unknown>): void {
  if (model.toLowerCase().includes('minimax')) {
    body.max_tokens = REASONING_TOKENS;
    body.reasoning_effort = 'none';
    body.chat_template_kwargs = { thinking_mode: 'disabled' };
    return;
  }
  if (model === PRIMARY_MODEL || model.toLowerCase().includes('glm')) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  if (model.toLowerCase().includes('glm')) {
    body.reasoning_effort = 'none';
  }
}

function completionBody(
  model: string,
  input: ComposeInput,
  items: LibraryItem[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: ANSWER_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt(items) },
      {
        role: 'user',
        content: `Заголовок: «${input.text.slice(0, 400)}». Формат: ${FORMAT_LABEL[input.format]}.`,
      },
    ],
  };
  tuneBody(model, body);
  return body;
}

async function askModel(
  model: string,
  input: ComposeInput,
  items: LibraryItem[],
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<ScenePick> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(NVIDIA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completionBody(model, input, items)),
      signal,
    });
  } catch (error) {
    if (signal.aborted || isTimeout(error)) throw new ModelTimeoutError();
    throw error;
  }
  if (!response.ok) {
    throw new Error(`model status ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: unknown }[];
  };
  const parsed = parseModelMessage(payload.choices?.[0]?.message);
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

/**
 * Walks the NVIDIA chain until one model returns a pick. Each model has a
 * short timeout, the whole walk has a deadline, and a model that just timed
 * out is skipped until the process cools down. Tags cover every miss.
 */
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
  const deadlineMs = deps.deadlineMs ?? COMPOSE_DEADLINE_MS;
  const cooldownMs = deps.cooldownMs ?? TIMEOUT_COOLDOWN_MS;
  const deadlineAt = Date.now() + deadlineMs;
  for (const model of chainFor({ ...deps })) {
    const remaining = deadlineAt - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    if (cooling(model, Date.now())) continue;
    const attempt = Math.max(1, Math.min(timeoutMs, remaining));
    try {
      return await askModel(
        model,
        { ...input, text },
        items,
        apiKey,
        fetchFn,
        attempt,
      );
    } catch (error) {
      if (isTimeout(error)) rememberTimeout(model, cooldownMs);
    }
  }
  return tagsPick(text, items);
}
