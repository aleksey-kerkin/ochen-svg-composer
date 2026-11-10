import { useState, type FormEvent, type KeyboardEvent } from 'react';
import manifest from '../library/manifest.json' with { type: 'json' };
import type { Manifest } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';

const { items } = manifest as Manifest;

const nameById = new Map(items.map((item) => [item.objectId, item.name.ru]));

export function PromptBar() {
  const [text, setText] = useState('');
  const composeNames = useComposition((state) => state.composeNames);
  const nameQuery = useComposition((state) => state.nameQuery);

  function submit() {
    composeNames(text);
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

  return (
    <section className="prompt panel" aria-label="Сборка по названиям">
      <form className="prompt__form" onSubmit={onSubmit}>
        <input
          type="text"
          className="prompt__input"
          aria-label="Собрать из объектов"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="seg prompt__submit">
          Собрать
        </button>
      </form>
      {(matches.length > 0 || unknown.length > 0) && (
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
          {unknown.length > 0 && (
            <p className="prompt__unknown" role="status">
              Не распознано: {unknown.join(', ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
