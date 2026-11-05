import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import {
  activeLyricIndex,
  useProgress,
  type AppTrack,
  type LyricLine,
  type Lyrics,
} from '@/core';
import { Icon } from '@/ui/components/Icon';
import { Text } from '@/ui/components/Text';
import { haptics } from '@/ui/haptics';
import { nav } from '@/ui/nav';
import { colors, gradientFor, radius, space } from '@/ui/theme';

const LEAD_MS = 250;

export function LyricsCard({ track, lyrics }: { track: AppTrack; lyrics: Lyrics }) {
  const [tint] = gradientFor(track.album || track.title);
  const isSynced = (lyrics.synced?.length ?? 0) > 0;

  const openLyrics = () => {
    haptics.tap();
    nav.lyrics();
  };

  return (
    <Pressable
      onPress={openLyrics}
      accessibilityRole="button"
      accessibilityLabel="Lyrics, tap to expand"
      accessibilityHint="Opens full lyrics view"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tint },
        pressed && styles.pressed,
      ]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lyrics</Text>
        <View style={styles.expandButton}>
          <Icon name="expand-outline" size={16} color={colors.white} />
        </View>
      </View>

      <View style={styles.content}>
        {isSynced ? (
          <SyncedPreview lines={lyrics.synced!} />
        ) : (
          <PlainPreview text={lyrics.plain ?? ''} />
        )}
      </View>
    </Pressable>
  );
}

function SyncedPreview({ lines }: { lines: LyricLine[] }) {
  const { positionMs } = useProgress();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const ys = useRef<number[]>([]);
  const active = activeLyricIndex(lines, positionMs + LEAD_MS);

  useEffect(() => {
    const y = ys.current[active];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 48), animated: true });
    }
  }, [active]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      pointerEvents="none">
      {lines.map((l, i) => {
        const isActive = i === active;
        const isPast = i < active;
        const stateStyle = isActive
          ? styles.lineActive
          : isPast
            ? styles.linePast
            : styles.lineFuture;
        const isGap = !l.text;
        return (
          <View
            key={i}
            onLayout={(e) => {
              ys.current[i] = e.nativeEvent.layout.y;
            }}
            style={styles.lineWrap}>
            <Text
              style={[
                styles.lineText,
                stateStyle,
                isGap && styles.gapText,
              ]}
              numberOfLines={2}>
              {isGap ? '♪' : l.text}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function PlainPreview({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);

  return (
    <View style={styles.plainContainer} pointerEvents="none">
      {lines.map((line, i) => (
        <Text key={i} style={styles.plainLineText} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: space.lg,
    overflow: 'hidden',
    height: 260,
  },
  pressed: {
    opacity: 0.92,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  headerTitle: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: space.xs,
    gap: space.sm,
  },
  lineWrap: {
    justifyContent: 'center',
  },
  lineText: {
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  lineActive: {
    color: colors.white,
    fontWeight: '800',
    opacity: 1,
  },
  linePast: {
    color: colors.white,
    fontWeight: '700',
    opacity: 0.6,
  },
  lineFuture: {
    color: colors.white,
    fontWeight: '600',
    opacity: 0.35,
  },
  gapText: {
    fontSize: 18,
    fontWeight: '800',
  },
  plainContainer: {
    gap: space.sm,
    paddingVertical: space.xs,
  },
  plainLineText: {
    color: colors.white,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    opacity: 0.9,
  },
});
