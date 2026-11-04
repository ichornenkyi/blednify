import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FullWindowOverlay } from 'react-native-screens';

/**
 * Renders global overlays above native modals (the Now Playing modal on iOS is a UIKit presentation that would
 * otherwise cover JS siblings of the navigator). Android modals are in-hierarchy, so a plain fragment suffices.
 */
export function TopLayer({ children, gestures }: { children: ReactNode; gestures?: boolean }) {
  if (Platform.OS !== 'ios') return children;
  return (
    <FullWindowOverlay>
      {gestures ? (
        <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {children}
        </GestureHandlerRootView>
      ) : (
        children
      )}
    </FullWindowOverlay>
  );
}
