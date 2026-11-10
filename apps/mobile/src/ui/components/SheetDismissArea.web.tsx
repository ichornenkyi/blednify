import { useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

/** A long press can open a sheet before touch-up. Its compatibility click must not dismiss that new sheet. */
export function SheetDismissArea({ onDismiss }: { onDismiss: () => void }) {
  const pointer = useRef<number | null>(null);
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPointerDown={(e) => { pointer.current = e.nativeEvent.pointerId; }}
      onPointerCancel={() => { pointer.current = null; }}
      onPress={(e) => {
        const click = e.nativeEvent as unknown as { pointerId?: number; detail?: number; type?: string };
        const startedHere = pointer.current !== null && (click.pointerId === undefined || click.pointerId === pointer.current);
        pointer.current = null;
        // Keyboard and assistive-technology activation do not have a preceding pointer-down.
        const keyboard = click.detail === 0 || click.type === 'keyup' || click.type === 'keydown';
        if (startedHere || keyboard) onDismiss();
      }}
    />
  );
}
