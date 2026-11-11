import { useRef, type ReactNode } from 'react';

/** Ignore the opening long press's compatibility click, whether it lands on the scrim or an action. */
export function SheetPressBoundary({ children }: { children: ReactNode }) {
  const pointerStartedHere = useRef(false);
  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onPointerDownCapture={() => { pointerStartedHere.current = true; }}
      onPointerCancelCapture={() => { pointerStartedHere.current = false; }}
      onClickCapture={(e) => {
        // WebKit can give a touch and its compatibility click different pointer IDs.
        const startedHere = pointerStartedHere.current;
        pointerStartedHere.current = false;
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
