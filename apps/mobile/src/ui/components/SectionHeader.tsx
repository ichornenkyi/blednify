import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Pressable } from '../desktop/web';
import { useGutter } from '../layout';
import { makeStyles, space, useColors } from '../theme';
import { Text } from './Text';

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  extra,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Controls after the action (e.g. rail scroll arrows in the wide layout). */
  extra?: ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const gutter = useGutter();
  return (
    <View style={[styles.row, { paddingHorizontal: gutter }]}>
      <Text variant="heading" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onAction}>
          {({ hovered }) => (
            <Text variant="caption" color={hovered ? colors.text : colors.textSecondary} style={styles.action}>
              {actionLabel}
            </Text>
          )}
        </Pressable>
      ) : null}
      {extra}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginBottom: space.md },
  title: { flex: 1 },
  action: { fontWeight: '700' },
}));
