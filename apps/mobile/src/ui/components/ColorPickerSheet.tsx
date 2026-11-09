import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { TextInput, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '../haptics';
import { closeSheet } from '../overlay';
import { makeStyles, normalizeHex, parseHex, radius, space, useColors } from '../theme';
import { PressableScale } from './PressableScale';
import { PrimaryButton } from './PrimaryButton';
import { Text } from './Text';

// --- HSV <-> hex (worklet-safe) ------------------------------------------------------------------

type HSV = { h: number; s: number; v: number };

function hsvToHex(h: number, s: number, v: number): string {
  'worklet';
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    const x = Math.round(c * 255).toString(16);
    return x.length === 1 ? `0${x}` : x;
  };
  return `#${f(5)}${f(3)}${f(1)}`.toUpperCase();
}

function hexToHsv(hex: string): HSV | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

const HUES = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;
const THUMB = 26;
const HUE_H = 28;

export type ColorPickerSheetProps = {
  title: string;
  initial: string;
  /** Quick picks under the picker. */
  swatches?: readonly string[];
  onApply(hex: string): void;
};

/** In-app color picker: saturation/brightness field, hue slider, hex field and quick swatches. */
export function ColorPickerSheet({ title, initial, swatches = [], onApply }: ColorPickerSheetProps) {
  const styles = useStyles();
  const colors = useColors();
  const start = hexToHsv(initial) ?? { h: 0, s: 1, v: 1 };
  const [hex, setHex] = useState(hsvToHex(start.h, start.s, start.v));
  const [draft, setDraft] = useState(hex);

  const h = useSharedValue(start.h);
  const s = useSharedValue(start.s);
  const v = useSharedValue(start.v);
  const fieldW = useSharedValue(1);
  const fieldH = useSharedValue(1);
  const hueW = useSharedValue(1);

  const publish = (next: string) => {
    setHex(next);
    setDraft(next);
  };

  const setFrom = (next: string) => {
    const hsv = hexToHsv(next);
    if (!hsv) return false;
    h.set(hsv.h);
    s.set(hsv.s);
    v.set(hsv.v);
    publish(hsvToHex(hsv.h, hsv.s, hsv.v));
    return true;
  };

  const field = usePanGesture({
    minDistance: 0,
    onActivate: (e) => {
      'worklet';
      s.set(Math.min(1, Math.max(0, e.x / fieldW.get())));
      v.set(1 - Math.min(1, Math.max(0, e.y / fieldH.get())));
      scheduleOnRN(publish, hsvToHex(h.get(), s.get(), v.get()));
    },
    onUpdate: (e) => {
      'worklet';
      s.set(Math.min(1, Math.max(0, e.x / fieldW.get())));
      v.set(1 - Math.min(1, Math.max(0, e.y / fieldH.get())));
      scheduleOnRN(publish, hsvToHex(h.get(), s.get(), v.get()));
    },
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(haptics.select);
    },
  });

  const hue = usePanGesture({
    minDistance: 0,
    onActivate: (e) => {
      'worklet';
      h.set(Math.min(359.9, Math.max(0, (e.x / hueW.get()) * 360)));
      scheduleOnRN(publish, hsvToHex(h.get(), s.get(), v.get()));
    },
    onUpdate: (e) => {
      'worklet';
      h.set(Math.min(359.9, Math.max(0, (e.x / hueW.get()) * 360)));
      scheduleOnRN(publish, hsvToHex(h.get(), s.get(), v.get()));
    },
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(haptics.select);
    },
  });

  const fieldBg = useAnimatedStyle(() => ({ backgroundColor: hsvToHex(h.get(), 1, 1) }));
  const fieldThumb = useAnimatedStyle(() => ({
    backgroundColor: hsvToHex(h.get(), s.get(), v.get()),
    transform: [{ translateX: s.get() * fieldW.get() - THUMB / 2 }, { translateY: (1 - v.get()) * fieldH.get() - THUMB / 2 }],
  }));
  const hueThumb = useAnimatedStyle(() => ({
    backgroundColor: hsvToHex(h.get(), 1, 1),
    transform: [{ translateX: (h.get() / 360) * hueW.get() - THUMB / 2 }],
  }));
  const preview = useAnimatedStyle(() => ({ backgroundColor: hsvToHex(h.get(), s.get(), v.get()) }));

  const onFieldLayout = (e: LayoutChangeEvent) => {
    fieldW.set(e.nativeEvent.layout.width);
    fieldH.set(e.nativeEvent.layout.height);
  };
  const onHueLayout = (e: LayoutChangeEvent) => hueW.set(e.nativeEvent.layout.width);

  const draftValid = normalizeHex(draft) !== null;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text variant="heading" style={styles.flex}>
          {title}
        </Text>
        <View style={styles.compare}>
          <View style={[styles.compareHalf, { backgroundColor: initial }]} />
          <Animated.View style={[styles.compareHalf, preview]} />
        </View>
      </View>

      <GestureDetector gesture={field}>
        <Animated.View style={[styles.field, fieldBg]} onLayout={onFieldLayout}>
          <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.fill} />
          <LinearGradient colors={['rgba(0,0,0,0)', '#000000']} style={styles.fill} />
          <Animated.View pointerEvents="none" style={[styles.thumb, fieldThumb]} />
        </Animated.View>
      </GestureDetector>

      <GestureDetector gesture={hue}>
        <View style={styles.hueTrack} onLayout={onHueLayout}>
          <LinearGradient colors={HUES} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.fill, styles.hueBar]} />
          <Animated.View pointerEvents="none" style={[styles.thumb, styles.hueThumb, hueThumb]} />
        </View>
      </GestureDetector>

      <View style={styles.hexRow}>
        <Animated.View style={[styles.hexChip, preview]} />
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            const n = normalizeHex(t);
            if (n && t.replace('#', '').length === 6) setFrom(n);
          }}
          onSubmitEditing={() => {
            const n = normalizeHex(draft);
            if (n) setFrom(n);
          }}
          onBlur={() => setDraft(hex)}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          returnKeyType="done"
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={[styles.hexInput, !draftValid && { color: colors.danger }]}
        />
      </View>

      {swatches.length ? (
        <View style={styles.swatches}>
          {swatches.map((c) => (
            <PressableScale
              key={c}
              onPress={() => {
                haptics.select();
                setFrom(c);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Pick ${c}`}
              style={[styles.swatch, { backgroundColor: c }, c === hex && { borderColor: colors.text, borderWidth: 2 }]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.buttons}>
        <PrimaryButton label="Cancel" variant="surface" onPress={closeSheet} style={styles.flex} />
        <PrimaryButton
          label="Apply"
          icon="checkmark"
          onPress={() => {
            closeSheet();
            onApply(hex);
          }}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.lg },
  flex: { flex: 1 },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  compare: {
    flexDirection: 'row',
    width: 64,
    height: 32,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  compareHalf: { flex: 1 },
  field: { height: 196, borderRadius: radius.lg, overflow: 'visible' },
  thumb: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  hueTrack: { height: HUE_H, justifyContent: 'center' },
  hueBar: { borderRadius: HUE_H / 2 },
  hueThumb: { top: (HUE_H - THUMB) / 2 },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.md,
  },
  hexChip: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  hexInput: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.borderStrong },
  buttons: { flexDirection: 'row', gap: space.md },
}));
