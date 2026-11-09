import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, space, TRACK_ROW_HEIGHT, useColors } from '../theme';
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
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      android_ripple={{ color: colors.ripple }}
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


const useStyles = makeStyles((colors) => ({
  row: {
    minHeight: TRACK_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  pressed: { backgroundColor: colors.pressed },
  meta: { flex: 1, minWidth: 0, gap: 2 },
}));
