import { useEffect } from 'react';
import { useComposition } from '../store/useComposition.ts';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function isDuplicateShortcut(event: KeyboardEvent): boolean {
  return (
    (event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)
  );
}

function nudgeSelection(event: KeyboardEvent, uid: string): void {
  const state = useComposition.getState();
  const step = event.shiftKey ? 10 : 1;
  switch (event.key) {
    case 'Delete':
    case 'Backspace':
      state.remove(uid);
      event.preventDefault();
      break;
    case '[':
      state.sendBackward(uid);
      break;
    case ']':
      state.bringForward(uid);
      break;
    case 'ArrowLeft':
      state.move(uid, -step, 0);
      event.preventDefault();
      break;
    case 'ArrowRight':
      state.move(uid, step, 0);
      event.preventDefault();
      break;
    case 'ArrowUp':
      state.move(uid, 0, -step);
      event.preventDefault();
      break;
    case 'ArrowDown':
      state.move(uid, 0, step);
      event.preventDefault();
      break;
    default:
      break;
  }
}

export function useEditorHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const state = useComposition.getState();
      if (isDuplicateShortcut(event)) {
        event.preventDefault();
        if (state.selectedUid) state.duplicate(state.selectedUid);
        return;
      }
      if (!state.selectedUid) return;
      nudgeSelection(event, state.selectedUid);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
