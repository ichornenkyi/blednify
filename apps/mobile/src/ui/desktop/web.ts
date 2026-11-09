import type { ComponentRef, ComponentType, ReactNode, Ref } from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, View, type ViewStyle } from 'react-native';

/** Pressable state on react-native-web, which adds hover and keyboard focus to `pressed`. */
export type WebPressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export type WebPressableProps = Omit<PressableProps, 'style' | 'children'> & {
  ref?: Ref<ComponentRef<typeof View>>;
  style?: StyleProp<ViewStyle> | ((state: WebPressState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: WebPressState) => ReactNode);
  /** Right-click / long-press menu (DOM event, forwarded by react-native-web). */
  onContextMenu?: (e: MouseEvent) => void;
};

/**
 * Props that open a context menu on right-click (web), passing the cursor position. Spread onto any
 * Pressable / View; empty when there is no handler.
 */
export function contextMenu(handler: ((anchor: { x: number; y: number }) => void) | undefined): object {
  if (!handler) return {};
  return {
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      handler({ x: e.clientX, y: e.clientY });
    },
  };
}

/** `Pressable` typed with the react-native-web extras the wide layout relies on. */
export const Pressable = RNPressable as unknown as ComponentType<WebPressableProps>;
