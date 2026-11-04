import { DarkTheme, type Theme } from 'expo-router';
import { StyleSheet, type TextStyle } from 'react-native';

export const colors = {
  bg: '#0A0A0C',
  surface: '#141418',
  surface2: '#1C1C22',
  surface3: '#26262E',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F5F5F7',
  textSecondary: '#9A9AA3',
  textTertiary: '#64646D',
  accent: '#E5383B',
  accentPressed: '#C3282B',
  accentDeep: '#7A1517',
  accentSoft: 'rgba(229,56,59,0.16)',
  danger: '#FF5A5F',
  success: '#3DD68C',
  scrim: 'rgba(0,0,0,0.6)',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** 8pt grid. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const type = StyleSheet.create({
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1.1, color: colors.text },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.1, color: colors.text },
  bodyStrong: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: colors.textSecondary },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.6, color: colors.textSecondary },
  mono: { fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.textSecondary },
}) satisfies Record<string, TextStyle>;

export const TAB_BAR_HEIGHT = 56;
export const MINI_PLAYER_HEIGHT = 60;
export const TRACK_ROW_HEIGHT = 64;

/** Deep, desaturated tile gradients for artwork fallbacks — brand-red first. */
const FALLBACK_GRADIENTS: readonly (readonly [string, string])[] = [
  ['#E5383B', '#5C0F12'],
  ['#8E2DE2', '#2A0E4A'],
  ['#2B5876', '#101C2B'],
  ['#C06C2B', '#3B1A08'],
  ['#1F8A70', '#0B2B24'],
  ['#B33771', '#3A0E22'],
  ['#4A5BD6', '#141A45'],
];

export function gradientFor(seed: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return FALLBACK_GRADIENTS[Math.abs(h) % FALLBACK_GRADIENTS.length];
}

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};
