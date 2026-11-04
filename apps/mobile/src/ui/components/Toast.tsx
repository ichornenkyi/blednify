import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlayer } from '@/core';

import { dismissToast, showToast, useOverlay, type ToastKind } from '../overlay';
import { colors, radius, space } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { TopLayer } from './TopLayer';

const ICONS: Record<Exclude<ToastKind, 'progress'>, { name: IconName; color: string }> = {
  info: { name: 'information-circle', color: colors.textSecondary },
  success: { name: 'checkmark-circle', color: colors.success },
  error: { name: 'alert-circle', color: colors.danger },
};

/** Global toast host (mounted once in the root layout). Use `showToast()` to trigger. */
export function ToastHost() {
  const toast = useOverlay((s) => s.toast);
  const insets = useSafeAreaInsets();
  usePlaybackErrorToasts();
  return (
    <TopLayer>
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space.sm }]}>
        {toast ? (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.duration(220)}
            exiting={FadeOutUp.duration(180)}
            style={styles.toast}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            onTouchEnd={() => toast.kind !== 'progress' && dismissToast(toast.id)}>
            {toast.kind === 'progress' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name={ICONS[toast.kind].name} size={20} color={ICONS[toast.kind].color} />
            )}
            <Text variant="bodyStrong" style={styles.message} numberOfLines={2}>
              {toast.message}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </TopLayer>
  );
}

/** Surfaces every playback error app-wide; `errorId` changes even when the message repeats. */
function usePlaybackErrorToasts() {
  const error = usePlayer((s) => s.error);
  const errorId = usePlayer((s) => s.errorId);
  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error, errorId]);
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    maxWidth: 480,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: colors.black,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  message: { flexShrink: 1 },
});
