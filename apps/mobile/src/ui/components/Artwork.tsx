import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { PixelRatio, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { resizedArtworkUrl } from '@/core';

import { colors, gradientFor, radius as radii } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Assumed width of artwork that fills its parent, in points. */
const DEFAULT_FILL_SIZE = 200;

export type ArtworkProps = {
  uri: string | null | undefined;
  /** Text used for the fallback tile initials and gradient seed (album / artist / track title). */
  label: string;
  size?: number;
  radius?: number;
  round?: boolean;
  /** Use an icon instead of initials in the fallback tile. */
  fallbackIcon?: IconName;
  recyclingKey?: string;
  priority?: 'low' | 'normal' | 'high';
  style?: StyleProp<ViewStyle>;
};

function initials(label: string) {
  const words = label
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '♪';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

/** A copy of a server cover big enough to look sharp at `size` points, so a thumbnail never decodes a 3000px original. */
export function sizedArtworkUri(uri: string, size: number | undefined) {
  return resizedArtworkUrl(uri, Math.ceil((size ?? DEFAULT_FILL_SIZE) * PixelRatio.get()));
}

/**
 * Blurred full-bleed cover behind a screen. Browsers re-run a CSS blur this large whenever the area repaints, which
 * stutters on iPhones, so web stretches a 16px copy instead: that looks the same under the screen's dark gradient and
 * costs nothing to draw. Larger copies still show the cover's shapes.
 */
export function ArtworkBackdrop({ uri, blurRadius, transition }: { uri: string; blurRadius: number; transition: number }) {
  const web = Platform.OS === 'web';
  return (
    <Image
      source={resizedArtworkUrl(uri, web ? 16 : 256)}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      blurRadius={web ? undefined : blurRadius}
      cachePolicy="memory-disk"
      transition={transition}
    />
  );
}

/** Cover art via expo-image (memory+disk cache) with a branded gradient fallback. */
export function Artwork({ uri, label, size, radius = radii.sm, round, fallbackIcon, recyclingKey, priority, style }: ArtworkProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = !!uri && uri !== failedUri;
  const borderRadius = round ? 9999 : radius;
  const box = size !== undefined ? { width: size, height: size } : styles.fill;

  return (
    <View style={[styles.base, box, { borderRadius }, style]}>
      {showImage ? (
        <Image
          source={sizedArtworkUri(uri, size)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={recyclingKey ?? uri}
          transition={120}
          priority={priority}
          onError={() => setFailedUri(uri)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Fallback label={label} icon={fallbackIcon} size={size} />
      )}
    </View>
  );
}

function Fallback({ label, icon, size }: { label: string; icon?: IconName; size?: number }) {
  const [from, to] = gradientFor(label);
  const glyph = size !== undefined ? Math.max(12, Math.round(size * 0.34)) : 40;
  return (
    <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fallback}>
      {icon ? (
        <Icon name={icon} size={glyph} color="rgba(255,255,255,0.92)" />
      ) : (
        <Text style={[styles.initials, { fontSize: glyph, lineHeight: glyph * 1.15 }]}>{initials(label)}</Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', backgroundColor: colors.surface2 },
  fill: { width: '100%', aspectRatio: 1 },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  initials: { color: 'rgba(255,255,255,0.92)', fontWeight: '800', letterSpacing: -0.5 },
});
