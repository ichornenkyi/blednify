import { Pressable, StyleSheet } from 'react-native';

/** Native keeps the existing sheet scrim and press behavior. */
export function SheetDismissArea({ onDismiss }: { onDismiss: () => void }) {
  return <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Close" />;
}
