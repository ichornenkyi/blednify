import { useEffect, useState } from 'react';

/** Becomes true after `ms` — used to avoid flashing "not found" states while local data loads. */
export function useAfter(ms: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return done;
}
