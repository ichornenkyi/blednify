import { useRef, type ReactNode } from 'react';

/** Ignore the opening long press's compatibility click, whether it lands on the scrim or an action. */
export function SheetPressBoundary({ children }: { children: ReactNode }) {
  const pointer = useRef<number | null>(null);
  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onPointerDownCapture={(e) => { pointer.current = e.pointerId; }}
      onPointerCancelCapture={() => { pointer.current = null; }}
      onClickCapture={(e) => {
        const id = (e.nativeEvent as { pointerId?: number }).pointerId;
        const startedHere = pointer.current !== null && (id === undefined || id === pointer.current);
        pointer.current = null;
        // Keyboard and assistive technology clicks have no preceding pointer-down.
        if (e.detail !== 0 && !startedHere) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}>
      {children}
    </div>
  );
}
