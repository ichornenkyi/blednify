import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View, type ScrollViewInstance } from 'react-native';

import { hasLyrics, player, useActiveLyric, useLyrics, type AppTrack, type LyricLine, type Lyrics } from '@/core';

import { EmptyState } from '../components/EmptyState';
import { Text } from '../components/Text';
import { makeStyles, space, useColors } from '../theme';
import { Pressable } from './web';

/** After a manual scroll, wait this long before following the song again. */
const HOLD_MS = 3500;

type Size = 'panel' | 'stage';

/** Synced (click a line to jump there) or plain lyrics for the wide layout's panel and Now playing view. */
export function LyricsView({ track, size }: { track: AppTrack; size: Size }) {
  const styles = useStyles();
  const colors = useColors();
  const { lyrics, isLoading, isError } = useLyrics(track);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }
  if (lyrics?.synced?.length) return <Synced key={track.key} lines={lyrics.synced} source={lyrics.source} size={size} />;
  if (hasLyrics(lyrics)) return <Plain key={track.key} lyrics={lyrics!} size={size} />;
  const instrumental = !!lyrics?.instrumental;
  return (
    <View style={styles.center}>
      <EmptyState
        icon={isError ? 'cloud-offline-outline' : 'musical-notes-outline'}
        title={instrumental ? 'Instrumental' : isError ? 'Couldn’t load lyrics' : 'No lyrics for this song'}
        message={
          instrumental
            ? 'Just enjoy the music.'
            : isError
              ? 'Check the connection to your server.'
              : 'Put a .lrc file with the same name next to the song on your server to add them.'
        }
      />
    </View>
  );
}

function Synced({ lines, source, size }: { lines: LyricLine[]; source: Lyrics['source']; size: Size }) {
  const styles = useStyles();
  const scroll = useRef<ScrollViewInstance>(null);
  const ys = useRef<number[]>([]);
  const laidOut = useRef(0);
  const holdUntil = useRef(0);
  const placed = useRef(false);
  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState(400);
  const active = useActiveLyric(lines);

  const follow = (i: number, animated: boolean) => {
    const y = ys.current[Math.max(0, i)];
    if (y === undefined) return false;
    scroll.current?.scrollTo({ y: Math.max(0, y - viewport * 0.32), animated });
    return true;
  };

  useEffect(() => {
    if (Date.now() < holdUntil.current) return;
    if (follow(active, placed.current)) placed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow reads refs; re-run only when the line changes
  }, [active, viewport, ready]);

  const measure = (i: number, y: number) => {
    if (ys.current[i] === undefined && ++laidOut.current === lines.length) setReady(true);
    ys.current[i] = y;
  };

  const seek = (i: number) => {
    holdUntil.current = 0;
    player.seekTo(lines[i].timeMs);
    player.play();
    follow(i, true);
  };

  return (
    <ScrollView
      ref={scroll}
      style={styles.flex}
      contentContainerStyle={[size === 'stage' ? styles.stageLines : styles.panelLines, { paddingBottom: viewport * 0.55 }]}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
      // A wheel scroll by hand pauses auto-follow for a moment.
      {...({ onWheel: () => (holdUntil.current = Date.now() + HOLD_MS) } as object)}>
      {lines.map((l, i) => (
        <Line
          key={i}
          index={i}
          text={l.text}
          size={size}
          state={i === active ? 'active' : i < active ? 'past' : 'future'}
          onPress={seek}
          onMeasure={measure}
        />
      ))}
      <Credit source={source} />
    </ScrollView>
  );
}

type LineState = 'past' | 'active' | 'future';

const Line = memo(function Line({
  index,
  text,
  size,
  state,
  onPress,
  onMeasure,
}: {
  index: number;
  text: string;
  size: Size;
  state: LineState;
  onPress: (i: number) => void;
  onMeasure: (i: number, y: number) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      onPress={() => onPress(index)}
      onLayout={(e) => onMeasure(index, e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={text || 'Instrumental break'}
      accessibilityState={{ selected: state === 'active' }}>
      {({ hovered }) => (
        <Text
          style={[
            size === 'stage' ? styles.stageLine : styles.panelLine,
            styles.lineMotion,
            {
              color: state === 'active' ? colors.text : colors.textSecondary,
              opacity: state === 'active' || hovered ? 1 : state === 'past' ? 0.6 : colors.isLight ? 0.6 : 0.45,
            },
          ]}>
          {text || '♪'}
        </Text>
      )}
    </Pressable>
  );
});

function Plain({ lyrics, size }: { lyrics: Lyrics; size: Size }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <ScrollView style={styles.flex} contentContainerStyle={size === 'stage' ? styles.stageLines : styles.panelLines}>
      <Text variant="caption" color={colors.textTertiary}>
        These lyrics aren’t synced to the song yet.
      </Text>
      <Text style={[size === 'stage' ? styles.stagePlain : styles.panelPlain, { color: colors.text }]}>{lyrics.plain}</Text>
      <Credit source={lyrics.source} />
    </ScrollView>
  );
}

function Credit({ source }: { source: Lyrics['source'] }) {
  const styles = useStyles();
  if (source !== 'lrclib') return null;
  return (
    <Text variant="caption" style={styles.credit}>
      Lyrics from LRCLIB
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  panelLines: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  stageLines: { paddingHorizontal: space.xl, paddingTop: space.xxl, gap: space.lg },
  panelLine: { fontSize: 20, lineHeight: 27, fontWeight: '800', letterSpacing: -0.3 },
  stageLine: { fontSize: 34, lineHeight: 44, fontWeight: '800', letterSpacing: -0.8, maxWidth: 760 },
  lineMotion: { transitionProperty: 'color, opacity', transitionDuration: '260ms', cursor: 'pointer' } as object,
  panelPlain: { fontSize: 17, lineHeight: 26, fontWeight: '600' },
  stagePlain: { fontSize: 24, lineHeight: 36, fontWeight: '700', maxWidth: 760 },
  credit: { marginTop: space.lg, color: colors.textTertiary },
}));
