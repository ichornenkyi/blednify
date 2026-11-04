import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { player, usePlayer, type AppTrack, type RepeatMode } from '@/core';
import { Artwork } from '@/ui/components/Artwork';
import { DownloadButton } from '@/ui/components/DownloadButton';
import { EmptyState } from '@/ui/components/EmptyState';
import { Icon } from '@/ui/components/Icon';
import { IconButton } from '@/ui/components/IconButton';
import { LikeButton } from '@/ui/components/LikeButton';
import { PlaylistPicker } from '@/ui/components/PlaylistPicker';
import { PressableScale } from '@/ui/components/PressableScale';
import { SeekBar } from '@/ui/components/SeekBar';
import { Text } from '@/ui/components/Text';
import { openTrackActions } from '@/ui/components/TrackActions';
import { haptics } from '@/ui/haptics';
import { nav } from '@/ui/nav';
import { showSheet } from '@/ui/overlay';
import { colors, radius, space } from '@/ui/theme';

const DISMISS_DISTANCE = 140;

function dismiss() {
  if (router.canGoBack()) router.back();
}

export default function PlayerScreen() {
  const current = usePlayer((s) => s.current);
  const { height: screenH } = useWindowDimensions();
  const y = useSharedValue(0);

  const pan = usePanGesture({
    activeOffsetY: 14,
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      y.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > 1100) {
        y.set(
          withTiming(screenH, { duration: 200, easing: Easing.out(Easing.quad) }, (done) => {
            if (done) scheduleOnRN(dismiss);
          }),
        );
      } else {
        y.set(withSpring(0, { damping: 22, stiffness: 260 }));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }],
    borderRadius: interpolate(y.get(), [0, 80], [0, radius.xl], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {current ? (
          <NowPlaying track={current} />
        ) : (
          <View style={styles.empty}>
            <EmptyState icon="musical-notes-outline" title="Nothing playing" message="Pick something from your library to start listening.">
              <IconButton icon="chevron-down" label="Close" variant="filled" onPress={dismiss} />
            </EmptyState>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function NowPlaying({ track }: { track: AppTrack }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const art = Math.min(width - space.xl * 2, height * 0.42);

  const goArtist = () => {
    router.back();
    nav.artist(track.artistId, track.origin);
  };
  const goAlbum = () => {
    router.back();
    nav.album(track.albumId, track.origin);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.md }]}>
      <Backdrop uri={track.artworkUri} />

      <View style={styles.topBar}>
        <IconButton icon="chevron-down" label="Close player" size={28} onPress={dismiss} />
        <Pressable
          style={styles.topCenter}
          disabled={!track.album}
          onPress={goAlbum}
          accessibilityRole="button"
          accessibilityLabel={`Album ${track.album}`}>
          <Text variant="micro">NOW PLAYING</Text>
          <Text variant="caption" color={colors.text} numberOfLines={1} style={styles.bold}>
            {track.album || 'Single'}
          </Text>
        </Pressable>
        <IconButton
          icon="ellipsis-horizontal"
          label="More options"
          onPress={() => openTrackActions(track, { beforeNavigate: () => router.back() })}
        />
      </View>

      <View style={styles.artArea}>
        <PulsingArtwork track={track} size={art} playing={isPlaying} />
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text variant="title" numberOfLines={1}>
            {track.title}
          </Text>
          <Pressable onPress={goArtist} hitSlop={6} accessibilityRole="link" accessibilityLabel={`Artist ${track.artist}`}>
            <Text variant="body" color={colors.textSecondary} numberOfLines={1} style={styles.artist}>
              {track.artist}
            </Text>
          </Pressable>
        </View>
        <LikeButton track={track} size={28} />
      </View>

      <SeekBar key={track.key} fallbackDurationMs={track.durationMs} />

      <Transport />

      <View style={styles.bottomRow}>
        <DownloadButton track={track} />
        <IconButton icon="add-circle-outline" label="Add to playlist" size={26} onPress={() => showSheet(<PlaylistPicker tracks={[track]} />)} />
        <IconButton icon="list" label="Queue" size={26} onPress={nav.queue} />
      </View>
    </View>
  );
}

function Backdrop({ uri }: { uri: string | null }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {uri ? (
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={70} cachePolicy="memory-disk" transition={300} />
      ) : null}
      <LinearGradient
        colors={uri ? ['rgba(10,10,12,0.45)', 'rgba(10,10,12,0.78)', 'rgba(10,10,12,0.96)'] : [colors.accentDeep, '#2A0A0B', colors.bg]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function PulsingArtwork({ track, size, playing }: { track: AppTrack; size: number; playing: boolean }) {
  const scale = useSharedValue(playing ? 1 : 0.86);
  useEffect(() => {
    scale.set(withSpring(playing ? 1 : 0.86, { damping: 15, stiffness: 140 }));
  }, [playing, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
    shadowOpacity: interpolate(scale.get(), [0.86, 1], [0.25, 0.6]),
  }));
  return (
    <Animated.View style={[styles.artShadow, { width: size, height: size }, style]}>
      <Artwork uri={track.artworkUri} label={track.album || track.title} size={size} radius={radius.lg} recyclingKey={track.key} priority="high" />
    </Animated.View>
  );
}

const REPEAT_ICON: Record<RepeatMode, { label: string; badge?: string }> = {
  off: { label: 'Repeat off' },
  all: { label: 'Repeat all' },
  one: { label: 'Repeat one', badge: '1' },
};

function Transport() {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const isBuffering = usePlayer((s) => s.isBuffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);

  return (
    <View style={styles.transport}>
      <IconButton
        icon="shuffle"
        label={shuffle ? 'Shuffle on' : 'Shuffle off'}
        size={24}
        color={shuffle ? colors.accent : colors.textSecondary}
        haptic
        onPress={player.toggleShuffle}
      />
      <IconButton icon="play-skip-back" label="Previous" size={32} diameter={56} haptic onPress={player.previous} />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        activeScale={0.9}
        onPress={() => {
          haptics.press();
          player.togglePlay();
        }}
        style={styles.playButton}>
        {isBuffering && !isPlaying ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Icon name={isPlaying ? 'pause' : 'play'} size={34} color={colors.white} />
        )}
      </PressableScale>
      <IconButton icon="play-skip-forward" label="Next" size={32} diameter={56} haptic onPress={player.next} />
      <View>
        <IconButton
          icon="repeat"
          label={REPEAT_ICON[repeat].label}
          size={24}
          color={repeat === 'off' ? colors.textSecondary : colors.accent}
          haptic
          onPress={player.cycleRepeat}
        />
        {REPEAT_ICON[repeat].badge ? (
          <View style={styles.repeatBadge} pointerEvents="none">
            <Text style={styles.repeatBadgeText}>{REPEAT_ICON[repeat].badge}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  empty: { flex: 1, justifyContent: 'center' },
  root: { flex: 1, paddingHorizontal: space.xl, gap: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -space.md },
  topCenter: { flex: 1, alignItems: 'center', gap: 2 },
  bold: { fontWeight: '700' },
  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artShadow: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    shadowColor: colors.black,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 20,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleText: { flex: 1, minWidth: 0, gap: 2 },
  artist: { fontSize: 17, lineHeight: 22 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  repeatBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeText: { color: colors.white, fontSize: 9, lineHeight: 11, fontWeight: '800' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -space.md },
});
