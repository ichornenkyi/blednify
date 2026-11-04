import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, space, TRACK_ROW_HEIGHT } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Generic fixed-height row (playlists, artists, albums in lists, settings links). */
function ListRowImpl({
  leading,
  title,
  subtitle,
  onPress,
  onLongPress,
  trailing,
  chevron,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  trailing?: ReactNode;
  chevron?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      android_ripple={RIPPLE}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {leading}
      <View style={styles.meta}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevron-forward" size={18} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

export const ListRow = memo(ListRowImpl);

const RIPPLE = { color: 'rgba(255,255,255,0.06)' };

const styles = StyleSheet.create({
  row: {
    minHeight: TRACK_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  meta: { flex: 1, minWidth: 0, gap: 2 },
});
