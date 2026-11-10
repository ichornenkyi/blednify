import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration, player, useServerBase, useServerTrack } from '@/core';
import { ChromeHost, useChromeInset } from '@/ui/chrome';
import { Artwork } from '@/ui/components/Artwork';
import { Backdrop } from '@/ui/components/Backdrop';
import { DetailHeader } from '@/ui/components/DetailHeader';
import { IconButton } from '@/ui/components/IconButton';
import { ListRow } from '@/ui/components/ListRow';
import { Loading } from '@/ui/components/Loading';
import { DockedMiniPlayer } from '@/ui/components/MiniPlayer';
import { OpenInApp, SharedNotFound } from '@/ui/components/OpenInApp';
import { PlaylistPicker } from '@/ui/components/PlaylistPicker';
import { FloatingBack } from '@/ui/components/ScreenHeader';
import { openShare } from '@/ui/components/ShareSheet';
import { openTrackActions } from '@/ui/components/TrackActions';
import { haptics } from '@/ui/haptics';
import { nav } from '@/ui/nav';
import { showSheet } from '@/ui/overlay';
import { makeStyles, radius, space } from '@/ui/theme';

/** A single server song, mostly reached from a shared link (`/track/<id>`). */
export default function TrackScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const chromeInset = useChromeInset('detail');
  const hasServer = !!useServerBase();
  const { track, isLoading } = useServerTrack(id);
  const path = `/track/${id}`;

  if (!track) {
    return (
      <View style={styles.root}>
        <Backdrop />
        {isLoading ? (
          <Loading />
        ) : (
          <View style={[styles.root, styles.center]}>
            <SharedNotFound kind="song" hasServer={hasServer} />
          </View>
        )}
        <FloatingBack />
        <OpenInApp path={path} />
      </View>
    );
  }

  const meta = [track.year, track.durationMs > 0 ? formatDuration(track.durationMs) : null].filter(Boolean).join(' · ');
  return (
    <ChromeHost overlay={<DockedMiniPlayer />}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl + chromeInset }}>
        <DetailHeader
          renderArtwork={(size) => <Artwork uri={track.artworkUri} label={track.album || track.title} size={size} radius={radius.lg} priority="high" />}
          backdropUri={track.artworkUri}
          eyebrow="Song"
          title={track.title}
          subtitle={track.artist}
          onSubtitlePress={() => nav.artist(track.artistId, track.origin)}
          meta={meta}
          onPlay={() => {
            haptics.tap();
            player.playTracks([track], 0);
          }}
          onShuffle={null}
          actions={
            <>
              <IconButton icon="add" label="Add to playlist" variant="filled" onPress={() => showSheet(<PlaylistPicker tracks={[track]} />)} />
              <IconButton
                icon="share-outline"
                label="Share song"
                variant="filled"
                onPress={() =>
                  openShare({ target: { kind: 'track', id: track.id }, title: track.title, subtitle: track.artist, artworkUri: track.artworkUri })
                }
              />
              <IconButton icon="ellipsis-horizontal" label="More options" variant="filled" onPress={() => openTrackActions(track, { hideArtist: true })} />
            </>
          }
        />
        {track.album ? (
          <View style={styles.albumRow}>
            <ListRow
              leading={<Artwork uri={track.artworkUri} label={track.album} size={48} />}
              title={track.album}
              subtitle={`Album · ${track.artist}`}
              chevron
              onPress={() => nav.album(track.albumId, track.origin)}
            />
          </View>
        ) : null}
      </ScrollView>
      <FloatingBack />
      <OpenInApp path={path} />
    </ChromeHost>
  );
}

const useStyles = makeStyles(() => ({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  albumRow: { marginTop: space.lg },
}));
