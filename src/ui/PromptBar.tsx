import { useState, type FormEvent, type KeyboardEvent } from 'react';
import manifest from '../library/manifest.json' with { type: 'json' };
import type { Manifest, PlacedObject } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';
import { useFold, useWideScreen } from './useWideScreen.ts';

const { items } = manifest as Manifest;

const nameById = new Map(items.map((item) => [item.objectId, item.name.ru]));

type Mode = 'names' | 'meaning';

type Metaphor = { source: 'model' | 'tags'; reason: string };

function labelFor(objectId: string): string {
  return nameById.get(objectId) ?? objectId;
}

function ModeSwitch({
  meaning,
  onChange,
}: {
  meaning: boolean;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div className="toolbar__group" role="group" aria-label="Режим сборки">
      <button
        type="button"
        className="seg"
        aria-pressed={!meaning}
        onClick={() => onChange('names')}
      >
        Названия
      </button>
      <button
        type="button"
        className="seg"
        aria-pressed={meaning}
        onClick={() => onChange('meaning')}
      >
        Смысл
      </button>
    </div>
  );
}

function PromptResults({
  meaning,
  matches,
  unknown,
  metaphor,
  objects,
}: {
  meaning: boolean;
  matches: { objectId: string; count: number }[];
  unknown: string[];
  metaphor?: Metaphor;
  objects: PlacedObject[];
}) {
  const showNames = !meaning && (matches.length > 0 || unknown.length > 0);
  if (!showNames && !(meaning && metaphor)) return null;
  return (
    <div className="prompt__results">
      {!meaning && matches.length > 0 && (
        <ul className="prompt__chips" aria-label="Распознанные объекты">
          {matches.map((match) => (
            <li key={match.objectId} className="prompt__chip">
              {labelFor(match.objectId)}
              {match.count > 1 ? ` × ${match.count}` : ''}
            </li>
          ))}
        </ul>
      )}
      {meaning && metaphor && (
        <ul className="prompt__chips" aria-label="Подобранные объекты">
          {objects.map((object) => (
            <li key={object.uid} className="prompt__chip">
              {labelFor(object.objectId)}
              {object.role === 'background' ? ' · фон' : ''}
            </li>
          ))}
        </ul>
      )}
      {!meaning && unknown.length > 0 && (
        <p className="prompt__unknown" role="status">
          Не распознано: {unknown.join(', ')}
        </p>
      )}
      {meaning && metaphor && (
        <p className="prompt__source" role="status">
          {metaphor.source === 'model' ? 'Собрала модель' : 'Собрано по тегам'}
          {metaphor.reason.startsWith('По смыслу')
            ? `. ${metaphor.reason}`
            : ''}
        </p>
      )}
    </div>
  );
}

export function PromptBar() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('names');
  const composeNames = useComposition((state) => state.composeNames);
  const composeMetaphor = useComposition((state) => state.composeMetaphor);
  const nameQuery = useComposition((state) => state.nameQuery);
  const metaphor = useComposition((state) => state.metaphor);
  const metaphorPending = useComposition((state) => state.metaphorPending);
  const objects = useComposition((state) => state.objects);
  const meaning = mode === 'meaning';
  const wide = useWideScreen();
  const [modeOpen, setModeOpen] = useFold(wide);

  function submit() {
    if (mode === 'names') composeNames(text);
    else void composeMetaphor(text);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section
      className="prompt panel"
      aria-label="Сборка"
      aria-busy={metaphorPending}
    >
      <details
        className="fold"
        open={modeOpen}
        onToggle={(event) => setModeOpen(event.currentTarget.open)}
      >
        <summary>Режим</summary>
        <ModeSwitch meaning={meaning} onChange={setMode} />
      </details>
      <form className="prompt__form" onSubmit={onSubmit}>
        <input
          type="text"
          className="prompt__input"
          aria-label={
            meaning ? 'Метафора или заголовок' : 'Собрать из объектов'
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="seg prompt__submit"
          disabled={metaphorPending}
        >
          {metaphorPending ? 'Подбираем…' : 'Собрать'}
        </button>
      </form>
      <PromptResults
        meaning={meaning}
        matches={nameQuery?.matches ?? []}
        unknown={nameQuery?.unknown ?? []}
        metaphor={metaphor}
        objects={objects}
      />
    </section>
  );
}
