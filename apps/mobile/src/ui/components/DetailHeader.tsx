import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../theme';
import { ArtworkBackdrop } from './Artwork';
import { PrimaryButton } from './PrimaryButton';
import { Text } from './Text';

export type DetailHeaderProps = {
  /** Rendered artwork (Artwork / PlaylistArtwork) sized by the header. */
  renderArtwork: (size: number) => ReactNode;
  /** Image used for the blurred backdrop. */
  backdropUri: string | null | undefined;
  eyebrow: string;
  title: string;
  subtitle?: string;
  onSubtitlePress?: () => void;
  meta?: string;
  onPlay?: () => void;
  onShuffle?: () => void;
  /** Extra action buttons rendered next to Play / Shuffle. */
  actions?: ReactNode;
  children?: ReactNode;
};

/** Full-bleed header with blurred artwork backdrop + gradient, artwork, titles and Play / Shuffle. */
export function DetailHeader({
  renderArtwork,
  backdropUri,
  eyebrow,
  title,
  subtitle,
  onSubtitlePress,
  meta,
  onPlay,
  onShuffle,
  actions,
  children,
}: DetailHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const art = Math.min(240, Math.round(width * 0.6));
  const disabled = !onPlay;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xxxl }]}>
      <View style={styles.backdrop} pointerEvents="none">
        {backdropUri ? <ArtworkBackdrop uri={backdropUri} blurRadius={60} transition={200} /> : null}
        <LinearGradient
          colors={backdropUri ? ['rgba(10,10,12,0.35)', 'rgba(10,10,12,0.75)', colors.bg] : [colors.accentDeep, 'rgba(10,10,12,0.6)', colors.bg]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={[styles.art, { width: art, height: art }]}>{renderArtwork(art)}</View>
      <View style={styles.text}>
        <Text variant="micro" color={colors.accent}>
          {eyebrow.toUpperCase()}
        </Text>
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Pressable disabled={!onSubtitlePress} onPress={onSubtitlePress} hitSlop={6}>
            <Text variant="bodyStrong" color={colors.text} numberOfLines={1}>
              {subtitle}
            </Text>
          </Pressable>
        ) : null}
        {meta ? (
          <Text variant="caption" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <PrimaryButton label="Play" icon="play" onPress={() => onPlay?.()} disabled={disabled} style={styles.flex} />
        <PrimaryButton label="Shuffle" icon="shuffle" variant="surface" onPress={() => onShuffle?.()} disabled={!onShuffle} style={styles.flex} />
        {actions}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 460, overflow: 'hidden' },
  art: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    shadowColor: colors.black,
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
    backgroundColor: colors.surface2,
  },
  text: { gap: space.xs },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
