import { useEffect, useState } from 'react';

const WIDE_QUERY = '(min-width: 641px)';

function wideNow(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return true;
  }
  return window.matchMedia(WIDE_QUERY).matches;
}

/** Desktop keeps rare controls open. A phone starts with them collapsed. */
export function useWideScreen(): boolean {
  const [wide, setWide] = useState(wideNow);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(WIDE_QUERY);
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return wide;
}

export function useFold(wide: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  return [wide || open, setOpen];
}
