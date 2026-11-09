import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_ICONS, appIconById, setAppIcon, useAppIcon, type AppIconId } from '@/core';
import { Backdrop } from '@/ui/components/Backdrop';
import { Icon } from '@/ui/components/Icon';
import { PressableScale } from '@/ui/components/PressableScale';
import { ScreenHeader } from '@/ui/components/ScreenHeader';
import { Text } from '@/ui/components/Text';
import { haptics } from '@/ui/haptics';
import { showToast } from '@/ui/overlay';
import { makeStyles, radius, space, useColors } from '@/ui/theme';

/** Squircle-ish corner ratio of the launcher masks the previews imitate. */
const CORNER = 0.3;

export default function AppIconScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const current = useAppIcon();

  const choose = (id: AppIconId) => {
    if (id === current) return;
    haptics.select();
    try {
      setAppIcon(id);
      showToast(`Icon set to ${appIconById(id).name}. Your launcher may take a moment to update.`, 'success');
    } catch {
      showToast('Could not change the icon', 'error');
    }
  };

  return (
    <View style={styles.root}>
      <Backdrop />
      <ScreenHeader title="App icon" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}>
        <View style={styles.hero}>
          <Image source={appIconById(current).image} style={styles.heroIcon} contentFit="cover" transition={150} />
          <Text variant="subheading">{appIconById(current).name}</Text>
          <Text variant="caption" style={styles.center}>
            Pick how Blednify looks on your home screen. Some launchers drop a pinned shortcut when the icon changes.
          </Text>
        </View>
        <View style={styles.grid}>
          {APP_ICONS.map((icon) => (
            <IconCell key={icon.id} id={icon.id} selected={icon.id === current} onPress={() => choose(icon.id)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function IconCell({ id, selected, onPress }: { id: AppIconId; selected: boolean; onPress(): void }) {
  const styles = useStyles();
  const colors = useColors();
  const icon = appIconById(id);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${icon.name} icon`}
      style={[styles.cell, selected && styles.cellSelected]}
    >
      <View>
        <Image source={icon.image} style={styles.icon} contentFit="cover" />
        {selected ? (
          <View style={styles.check}>
            <Icon name="checkmark" size={14} color={colors.onAccent} />
          </View>
        ) : null}
      </View>
      <Text variant="caption" color={selected ? colors.text : colors.textSecondary} numberOfLines={1}>
        {icon.name}
      </Text>
    </PressableScale>
  );
}

const ICON = 64;
const HERO = 112;

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xl },
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  heroIcon: { width: HERO, height: HERO, borderRadius: HERO * CORNER },
  center: { textAlign: 'center', paddingHorizontal: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
  cell: {
    width: '25%',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  cellSelected: { backgroundColor: colors.surface2, borderColor: colors.border },
  icon: { width: ICON, height: ICON, borderRadius: ICON * CORNER },
  check: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
  },
}));
