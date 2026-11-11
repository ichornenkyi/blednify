import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavStyle, usePlayer, type NavStyle } from '@/core';

import { useIsWide } from './layout';
import { makeStyles, MINI_PLAYER_HEIGHT, space, useColors, withAlpha } from './theme';

/**
 * Bottom chrome of the phone layout: the tab navigation and the mini player.
 *
 * - `classic`: a docked bar in the layout flow; content ends above it.
 * - `floating`: pills floating over the content, which scrolls underneath.
 * - `glass`: the same pills, translucent, blurring whatever is behind them.
 *
 * The wide layout has a sidebar and a player bar instead, so it always reports `classic`.
 */
export function useChromeStyle(): NavStyle {
  const style = useNavStyle();
  return useIsWide() ? 'classic' : style;
}

export const NAV_PILL_HEIGHT = 64;
/** Space between floating pills, and between the lowest one and the screen edge / gesture bar. */
export const CHROME_GAP = space.sm;
const CHROME_MARGIN = space.md;
/** Height over which rows fade out above the floating pills, and how far they fade. */
const DOCK_FADE = space.xxl;
const SCRIM = 0.9;

/**
 * Extra bottom padding a scrolling screen needs so its last rows clear the floating chrome; 0 with the
 * classic bar. `tabs` screens sit under the navigation pill and the mini player, `detail` screens (which
 * already pad the safe area) only under the mini player.
 */
export function useChromeInset(kind: 'tabs' | 'detail'): number {
  const chrome = useChromeStyle();
  const insets = useSafeAreaInsets();
  const hasTrack = usePlayer((s) => s.current !== null);
  if (chrome === 'classic') return 0;
  const mini = hasTrack ? MINI_PLAYER_HEIGHT + CHROME_GAP : 0;
  return kind === 'tabs' ? insets.bottom + CHROME_GAP + NAV_PILL_HEIGHT + CHROME_GAP + mini : mini ? mini + CHROME_GAP : 0;
}

/** Browsers blur what is painted behind the element. Strong enough that text behind never reads as text. */
const WEB_BLUR = { backdropFilter: 'blur(26px) saturate(170%)' } as ViewStyle;

type Target = RefObject<ComponentRef<typeof View> | null>;
const BlurTargetContext = createContext<Target | null>(null);

/** Android blurs a view it is told about, not what is on screen behind the surface; before 12 it cannot. */
const NATIVE_BLUR = Platform.OS === 'android';
const CAN_BLUR = Platform.OS !== 'android' || Number(Platform.Version) >= 31;

/**
 * A screen's content plus the chrome drawn over it. With glass on Android the content is the blur target,
 * so the chrome has to be a sibling of it (`overlay`), never a child.
 */
export function ChromeHost({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  const styles = useStyles();
  const chrome = useChromeStyle();
  const target = useRef<ComponentRef<typeof View>>(null);
  const blurs = NATIVE_BLUR && chrome === 'glass';
  return (
    <View style={styles.fill}>
      {blurs ? (
        <BlurTargetView ref={target} style={styles.content}>
          {children}
        </BlurTargetView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
      <BlurTargetContext.Provider value={blurs ? target : null}>{overlay}</BlurTargetContext.Provider>
    </View>
  );
}

/** Pins floating chrome to the bottom of a `ChromeHost`. Touches between and around the pills fall through. */
export function ChromeDock({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  const chrome = useChromeStyle();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: insets.bottom + CHROME_GAP }]}>
      {chrome === 'floating' ? (
        // Opaque pills over moving rows: the rows fade out as they pass behind. Glass wants them visible.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient colors={[withAlpha(colors.bg, 0), withAlpha(colors.bg, SCRIM)]} style={styles.fade} />
          <View style={styles.scrim} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** The material of a floating pill: a tonal surface, or glass that blurs the content behind it. */
export function ChromeSurface({ radius, style, children }: { radius: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  const chrome = useChromeStyle();
  const target = useContext(BlurTargetContext);
  if (chrome !== 'glass') return <View style={[styles.solid, { borderRadius: radius }, style]}>{children}</View>;
  const round = { borderRadius: radius };
  // The shadow and the clip live on different views. Android's blur draws the whole blurred screen and
  // relies on the clip to cut it to the pill; on the view that also casts the shadow, that clip leaked
  // a band of blur under the pill, over its own shadow.
  return (
    <View style={[styles.glass, round, style]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, round]}>
        {NATIVE_BLUR ? (
          <BlurView
            blurTarget={target ?? undefined}
            blurMethod="dimezisBlurViewSdk31Plus"
            // Android derives both the blur radius (intensity / reduction) and the opacity of its own
            // tint from intensity, and the radius is applied to a downscaled copy, so a small one goes a long way.
            intensity={16}
            blurReductionFactor={2}
            tint={colors.isLight ? 'light' : 'dark'}
            style={[StyleSheet.absoluteFill, round]}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, WEB_BLUR]} />
        )}
        <View style={[StyleSheet.absoluteFill, styles.glassTint]} />
        {/* Light catching the top edge. */}
        <LinearGradient
          colors={[colors.isLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.13)', 'rgba(255,255,255,0)']}
          style={styles.sheen}
        />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassEdge, round]} />
      {children}
    </View>
  );
}

/**
 * Glass for surfaces inside the content (tiles, cards, chips, buttons): translucent fill and a light edge,
 * plus a real blur on web. Inside scrolling content Android gets no blur: one native blur pass per tile
 * while scrolling costs too much, and these surfaces mostly sit on a flat background. Null unless Glass
 * is the chosen style, so callers can spread it after their own surface style.
 */
export function useGlassSurface(): ViewStyle | null {
  const styles = useStyles();
  return useChromeStyle() === 'glass' ? styles.surfaceGlass : null;
}

const useStyles = makeStyles((colors) => ({
  fill: { flex: 1 },
  surfaceGlass: {
    backgroundColor: colors.isLight ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.16)',
    ...(NATIVE_BLUR ? null : WEB_BLUR),
  },
  content: { flex: 1, backgroundColor: colors.bg },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: CHROME_MARGIN,
    paddingTop: DOCK_FADE,
    gap: CHROME_GAP,
  },
  fade: { height: DOCK_FADE },
  scrim: { flex: 1, backgroundColor: withAlpha(colors.bg, SCRIM) },
  solid: {
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    boxShadow: colors.isLight ? '0 6px 20px rgba(0,0,0,0.14)' : '0 8px 24px rgba(0,0,0,0.45)',
  },
  glass: {
    boxShadow: colors.isLight ? '0 8px 28px rgba(0,0,0,0.16)' : '0 10px 32px rgba(0,0,0,0.5)',
  },
  clip: { overflow: 'hidden' },
  glassEdge: { borderWidth: 1, borderColor: colors.isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.14)' },
  // Keeps text readable over any artwork. Without a working blur the tint has to do it alone.
  glassTint: { backgroundColor: withAlpha(colors.surface2, !CAN_BLUR ? 0.94 : NATIVE_BLUR ? 0.34 : 0.45) },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%' },
}));
