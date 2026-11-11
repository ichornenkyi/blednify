import type { ReactNode } from 'react';

/** Native keeps the existing sheet hierarchy and press behavior. */
export function SheetPressBoundary({ children }: { children: ReactNode }) {
  return children;
}
