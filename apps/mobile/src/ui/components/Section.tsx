import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Titled card used on Settings and Manage library. */
export function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={18} color={colors.accent} />
        <Text variant="micro">{title.toUpperCase()}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg },
  sectionBody: { padding: space.lg, gap: space.md },
});
