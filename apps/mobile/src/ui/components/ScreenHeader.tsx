import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

/** Simple top bar for secondary screens: back, title, optional trailing actions. */
export function ScreenHeader({
  title,
  right,
  backIcon = 'chevron-back',
}: {
  title: string;
  right?: ReactNode;
  backIcon?: 'chevron-back' | 'chevron-down';
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.xs }]}>
      <IconButton icon={backIcon} label="Back" size={26} onPress={() => router.back()} />
      <Text variant="subheading" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

/** Floating back button for full-bleed screens (album / artist / playlist). */
export function FloatingBack() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.floating, { top: insets.top + space.xs }]} pointerEvents="box-none">
      <IconButton icon="chevron-back" label="Back" variant="scrim" size={24} diameter={40} onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.sm, gap: space.xs },
  title: { flex: 1, textAlign: 'center' },
  right: { minWidth: 44, flexDirection: 'row', justifyContent: 'flex-end' },
  floating: { position: 'absolute', left: space.md, zIndex: 10 },
});
