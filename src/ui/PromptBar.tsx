import { useState, type FormEvent, type KeyboardEvent } from 'react';
import manifest from '../library/manifest.json' with { type: 'json' };
import type { Manifest } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';

const { items } = manifest as Manifest;

const nameById = new Map(items.map((item) => [item.objectId, item.name.ru]));

type Mode = 'names' | 'meaning';

export function PromptBar() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('names');
  const composeNames = useComposition((state) => state.composeNames);
  const composeMetaphor = useComposition((state) => state.composeMetaphor);
  const nameQuery = useComposition((state) => state.nameQuery);
  const metaphor = useComposition((state) => state.metaphor);
  const metaphorPending = useComposition((state) => state.metaphorPending);
  const objects = useComposition((state) => state.objects);

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

  const matches = nameQuery?.matches ?? [];
  const unknown = nameQuery?.unknown ?? [];
  const meaning = mode === 'meaning';

  return (
    <section
      className="prompt panel"
      aria-label="Сборка"
      aria-busy={metaphorPending}
    >
      <form className="prompt__form" onSubmit={onSubmit}>
        <div className="toolbar__group" role="group" aria-label="Режим сборки">
          <button
            type="button"
            className="seg"
            aria-pressed={!meaning}
            onClick={() => setMode('names')}
          >
            Названия
          </button>
          <button
            type="button"
            className="seg"
            aria-pressed={meaning}
            onClick={() => setMode('meaning')}
          >
            Смысл
          </button>
        </div>
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
      {(matches.length > 0 || unknown.length > 0 || metaphor) && (
        <div className="prompt__results">
          {matches.length > 0 && (
            <ul className="prompt__chips" aria-label="Распознанные объекты">
              {matches.map((match) => {
                const label = nameById.get(match.objectId) ?? match.objectId;
                return (
                  <li key={match.objectId} className="prompt__chip">
                    {label}
                    {match.count > 1 ? ` × ${match.count}` : ''}
                  </li>
                );
              })}
            </ul>
          )}
          {meaning && metaphor && (
            <ul className="prompt__chips" aria-label="Подобранные объекты">
              {objects.map((object) => {
                const label = nameById.get(object.objectId) ?? object.objectId;
                return (
                  <li key={object.uid} className="prompt__chip">
                    {label}
                    {object.role === 'background' ? ' · фон' : ''}
                  </li>
                );
              })}
            </ul>
          )}
          {unknown.length > 0 && (
            <p className="prompt__unknown" role="status">
              Не распознано: {unknown.join(', ')}
            </p>
          )}
          {meaning && metaphor && (
            <p className="prompt__source" role="status">
              {metaphor.source === 'model'
                ? 'Собрала модель'
                : 'Собрано по тегам'}
              {metaphor.reason.startsWith('По смыслу')
                ? `. ${metaphor.reason}`
                : ''}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
