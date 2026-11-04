import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, space } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function EmptyState({ icon, title, message, children }: { icon: IconName; title: string; message?: string; children?: ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={styles.badge}>
        <Icon name={icon} size={28} color={colors.accent} />
      </View>
      <Text variant="subheading" style={styles.center}>
        {title}
      </Text>
      {message ? (
        <Text variant="caption" style={[styles.center, styles.message]}>
          {message}
        </Text>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: space.xxxl, gap: space.sm },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: space.sm,
  },
  center: { textAlign: 'center' },
  message: { maxWidth: 300 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.md },
});
