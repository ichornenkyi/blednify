import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setThemePref, useThemePref } from '@/core';
import { Backdrop } from '@/ui/components/Backdrop';
import { ColorPickerSheet } from '@/ui/components/ColorPickerSheet';
import { Icon } from '@/ui/components/Icon';
import { PressableScale } from '@/ui/components/PressableScale';
import { PrimaryButton } from '@/ui/components/PrimaryButton';
import { ScreenHeader } from '@/ui/components/ScreenHeader';
import { Text } from '@/ui/components/Text';
import { haptics } from '@/ui/haptics';
import { showSheet } from '@/ui/overlay';
import {
  ACCENT_SWATCHES,
  BACKGROUND_SWATCHES,
  makeStyles,
  paletteFor,
  presetById,
  radius,
  space,
  THEME_PRESETS,
  useColors,
  type Palette,
  type ThemePreset,
} from '@/ui/theme';

export default function AppearanceScreen() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pref = useThemePref();
  const preset = presetById(pref.preset);
  const customized = pref.accent !== null || pref.background !== null;

  const choosePreset = (p: ThemePreset) => {
    haptics.select();
    // A preset is a complete look; picking one drops custom colors layered on the previous one.
    setThemePref({ preset: p.id, accent: null, background: null });
  };

  const pickAccent = (hex: string | null) => {
    haptics.select();
    setThemePref({ accent: hex });
  };

  const pickBackground = (hex: string | null) => {
    haptics.select();
    setThemePref({ background: hex });
  };

  const pickColor = (title: string, current: string, swatches: readonly string[], apply: (hex: string) => void) =>
    showSheet(<ColorPickerSheet title={title} initial={current} swatches={swatches} onApply={apply} />);

  return (
    <View style={styles.root}>
      <Backdrop />
      <ScreenHeader title="Appearance" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}>
        <Preview colors={colors} />

        <Text variant="micro" style={styles.label}>
          THEME
        </Text>
        <View style={styles.grid}>
          {THEME_PRESETS.map((p) => (
            <PresetCard key={p.id} preset={p} selected={p.id === pref.preset && !customized} onPress={() => choosePreset(p)} />
          ))}
        </View>

        <Text variant="micro" style={styles.label}>
          ACCENT
        </Text>
        <View style={styles.swatches}>
          <Swatch color={preset.accent} selected={pref.accent === null} label="Theme default" onPress={() => pickAccent(null)} badge="T" />
          {ACCENT_SWATCHES.filter((c) => c !== preset.accent).map((c) => (
            <Swatch key={c} color={c} selected={pref.accent === c} label={`Accent ${c}`} onPress={() => pickAccent(c)} />
          ))}
          <CustomSwatch
            active={pref.accent !== null && !(ACCENT_SWATCHES as readonly string[]).includes(pref.accent)}
            color={pref.accent}
            label="Custom accent"
            onPress={() => pickColor('Accent color', pref.accent ?? colors.accent, ACCENT_SWATCHES, pickAccent)}
          />
        </View>

        <Text variant="micro" style={styles.label}>
          BACKGROUND
        </Text>
        <View style={styles.swatches}>
          <Swatch color={preset.bg} selected={pref.background === null} label="Theme default" onPress={() => pickBackground(null)} badge="T" />
          {BACKGROUND_SWATCHES.filter((c) => c !== preset.bg).map((c) => (
            <Swatch key={c} color={c} selected={pref.background === c} label={`Background ${c}`} onPress={() => pickBackground(c)} />
          ))}
          <CustomSwatch
            active={pref.background !== null && !(BACKGROUND_SWATCHES as readonly string[]).includes(pref.background)}
            color={pref.background}
            label="Custom background"
            onPress={() => pickColor('Background color', pref.background ?? colors.bg, BACKGROUND_SWATCHES, pickBackground)}
          />
        </View>
        <Text variant="caption">Surfaces, text and contrast are derived from the background, so any color stays readable.</Text>

        {customized ? (
          <PrimaryButton
            label={`Reset to ${preset.name}`}
            icon="refresh-outline"
            variant="surface"
            onPress={() => {
              haptics.select();
              setThemePref({ accent: null, background: null });
            }}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** A miniature of the app in the active palette: a track row and the mini player. */
function Preview({ colors }: { colors: Palette }) {
  const styles = useStyles();
  return (
    <View style={styles.preview}>
      <Backdrop />
      <Text variant="heading">Good evening</Text>
      <View style={styles.previewRow}>
        <LinearGradient colors={[colors.accent, colors.accentDeep]} style={styles.previewArt} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" color={colors.accent} numberOfLines={1}>
            Now playing
          </Text>
          <Text variant="caption" numberOfLines={1}>
            Your favourite artist
          </Text>
        </View>
        <Icon name="heart" size={20} color={colors.accent} />
      </View>
      <View style={styles.previewRow}>
        <View style={[styles.previewArt, { backgroundColor: colors.surface3 }]} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            Up next
          </Text>
          <Text variant="caption" numberOfLines={1}>
            Another song
          </Text>
        </View>
        <Icon name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.previewMini}>
        <View style={styles.previewProgress}>
          <View style={styles.previewProgressFill} />
        </View>
        <View style={styles.previewMiniRow}>
          <LinearGradient colors={[colors.accent, colors.accentDeep]} style={styles.previewMiniArt} />
          <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
            Blednify
          </Text>
          <View style={styles.previewPlay}>
            <Icon name="play" size={16} color={colors.onAccent} />
          </View>
        </View>
      </View>
    </View>
  );
}

function PresetCard({ preset, selected, onPress }: { preset: ThemePreset; selected: boolean; onPress(): void }) {
  const styles = useStyles();
  const colors = useColors();
  const p = paletteFor({ preset: preset.id, accent: null, background: null });
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={preset.name}
      style={[styles.presetCard, selected && { borderColor: colors.accent }]}
    >
      <View style={[styles.presetSwatch, { backgroundColor: p.bg }]}>
        {preset.backdrop === 'stars' || preset.backdrop === 'night' ? <Icon name="sparkles" size={14} color={p.accent} /> : null}
        <View style={[styles.presetBar, { backgroundColor: p.surface2, width: '70%' }]} />
        <View style={[styles.presetBar, { backgroundColor: p.surface3, width: '45%' }]} />
        <View style={[styles.presetDot, { backgroundColor: p.accent }]} />
      </View>
      <View style={styles.presetFoot}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
          {preset.name}
        </Text>
        {selected ? <Icon name="checkmark-circle" size={18} color={colors.accent} /> : null}
      </View>
    </PressableScale>
  );
}

function Swatch({
  color,
  selected,
  label,
  onPress,
  badge,
}: {
  color: string;
  selected: boolean;
  label: string;
  onPress(): void;
  badge?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const p = paletteFor({ preset: 'blednify', accent: color, background: null });
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.swatchRing, selected && { borderColor: colors.accent }]}
    >
      <View style={[styles.swatch, { backgroundColor: color }]}>
        {selected ? <Icon name="checkmark" size={16} color={p.onAccent} /> : badge ? <Text variant="micro" color={p.onAccent}>{badge}</Text> : null}
      </View>
    </PressableScale>
  );
}

function CustomSwatch({ active, color, label, onPress }: { active: boolean; color: string | null; label: string; onPress(): void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.swatchRing, active && { borderColor: colors.accent }]}
    >
      <View style={[styles.swatch, styles.customSwatch, active && color ? { backgroundColor: color } : null]}>
        <Icon name="color-palette-outline" size={16} color={active ? colors.onAccent : colors.text} />
      </View>
    </PressableScale>
  );
}

const SWATCH = 36;

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  label: { marginTop: space.md },
  preview: {
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    padding: space.lg,
    gap: space.md,
    overflow: 'hidden',
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  previewArt: { width: 44, height: 44, borderRadius: radius.sm },
  previewMini: { borderRadius: radius.md, backgroundColor: colors.surface2, overflow: 'hidden' },
  previewProgress: { height: 2, backgroundColor: colors.track },
  previewProgressFill: { height: 2, width: '38%', backgroundColor: colors.accent },
  previewMiniRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm },
  previewMiniArt: { width: 36, height: 36, borderRadius: 6 },
  previewPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  presetCard: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  presetSwatch: { height: 76, padding: space.md, gap: 6, justifyContent: 'flex-end' },
  presetBar: { height: 8, borderRadius: 4 },
  presetDot: { position: 'absolute', right: space.md, top: space.md, width: 16, height: 16, borderRadius: 8 },
  presetFoot: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatchRing: { padding: 3, borderRadius: SWATCH, borderWidth: 2, borderColor: 'transparent' },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  customSwatch: { backgroundColor: colors.surface2 },
}));
