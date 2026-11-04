import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDuration, usePlayer, type AppTrack } from '@/core';

import { colors, space, TRACK_ROW_HEIGHT } from '../theme';
import { Artwork } from './Artwork';
import { Equalizer } from './Equalizer';
import { Icon } from './Icon';
import { Text } from './Text';

export type TrackRowProps = {
  track: AppTrack;
  index: number;
  onPress: (index: number) => void;
  onMore?: (track: AppTrack, index: number) => void;
  /** `number` shows the album track number instead of artwork. */
  leading?: 'artwork' | 'number';
  subtitle?: 'artist' | 'artist-album';
  showDuration?: boolean;
};

const ARTWORK = 48;

function TrackRowImpl({ track, index, onPress, onMore, leading = 'artwork', subtitle = 'artist', showDuration }: TrackRowProps) {
  // 0 = not current, 1 = current & paused, 2 = current & playing. Primitive selector ⇒ only affected rows re-render.
  const state = usePlayer((s) => (s.current?.key === track.key ? (s.isPlaying ? 2 : 1) : 0));
  const isCurrent = state > 0;
  const downloaded = track.origin === 'remote' && track.localUri !== null;
  const sub = subtitle === 'artist-album' && track.album ? `${track.artist} · ${track.album}` : track.artist;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${track.title} by ${track.artist}`}
      onPress={() => onPress(index)}
      onLongPress={onMore ? () => onMore(track, index) : undefined}
      delayLongPress={320}
      android_ripple={RIPPLE}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {leading === 'artwork' ? (
        <View>
          <Artwork uri={track.artworkUri} label={track.album || track.title} size={ARTWORK} recyclingKey={track.key} />
          {isCurrent ? (
            <View style={styles.eqOverlay}>
              <Equalizer playing={state === 2} size={16} color={colors.white} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.number}>
          {isCurrent ? (
            <Equalizer playing={state === 2} />
          ) : (
            <Text variant="mono" style={styles.numberText}>
              {track.trackNumber ?? index + 1}
            </Text>
          )}
        </View>
      )}
      <View style={styles.meta}>
        <Text variant="bodyStrong" numberOfLines={1} color={isCurrent ? colors.accent : colors.text}>
          {track.title}
        </Text>
        <View style={styles.subRow}>
          {downloaded ? <Icon name="arrow-down-circle" size={13} color={colors.accent} /> : null}
          {track.origin === 'local' ? <Icon name="phone-portrait-outline" size={12} color={colors.textTertiary} /> : null}
          <Text variant="caption" numberOfLines={1} style={styles.subText}>
            {sub}
          </Text>
        </View>
      </View>
      {showDuration ? (
        <Text variant="mono" style={styles.duration}>
          {formatDuration(track.durationMs)}
        </Text>
      ) : null}
      {onMore ? (
        <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={10} onPress={() => onMore(track, index)} style={styles.more}>
          <Icon name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const TrackRow = memo(TrackRowImpl);

const RIPPLE = { color: 'rgba(255,255,255,0.06)' };

const styles = StyleSheet.create({
  row: { height: TRACK_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md },
  pressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  eqOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { width: 28, alignItems: 'center' },
  numberText: { color: colors.textTertiary, fontSize: 14 },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  subText: { flexShrink: 1 },
  duration: { color: colors.textTertiary },
  more: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
});
