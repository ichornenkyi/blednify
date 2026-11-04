import { Pressable, StyleSheet, View } from 'react-native';

import { colors, space } from '../theme';
import { Text } from './Text';

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Text variant="heading" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onAction}>
          <Text variant="caption" color={colors.textSecondary} style={styles.action}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: space.lg, marginBottom: space.md },
  title: { flex: 1 },
  action: { fontWeight: '700' },
});
