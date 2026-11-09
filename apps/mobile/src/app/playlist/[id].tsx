import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { downloadTracks, player, usePlaylist, type AppTrack } from '@/core';
import { Backdrop } from '@/ui/components/Backdrop';
import { DetailHeader } from '@/ui/components/DetailHeader';
import { EmptyState } from '@/ui/components/EmptyState';
import { IconButton } from '@/ui/components/IconButton';
import { Loading } from '@/ui/components/Loading';
import { DockedMiniPlayer } from '@/ui/components/MiniPlayer';
import { openPlaylistActions } from '@/ui/components/PlaylistActions';
import { PlaylistArtwork } from '@/ui/components/PlaylistArtwork';
import { PrimaryButton } from '@/ui/components/PrimaryButton';
import { FloatingBack } from '@/ui/components/ScreenHeader';
import { openTrackActions } from '@/ui/components/TrackActions';
import { TrackRow } from '@/ui/components/TrackRow';
import { humanDuration, plural } from '@/ui/format';
import { haptics } from '@/ui/haptics';
import { showToast } from '@/ui/overlay';
import { useAfter } from '@/ui/useAfter';
import { makeStyles, radius, space } from '@/ui/theme';

export default function PlaylistScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { playlist, tracks } = usePlaylist(id);
  const settled = useAfter(500);

  if (!playlist) {
    return (
      <View style={styles.root}>
        <Backdrop />
        {settled ? (
          <View style={[styles.root, styles.center]}>
            <EmptyState icon="list-outline" title="Playlist not found" message="It may have been deleted.">
              <PrimaryButton label="Go back" variant="surface" onPress={() => router.back()} />
            </EmptyState>
          </View>
        ) : (
          <Loading />
        )}
        <FloatingBack />
      </View>
    );
  }

  const play = (index: number) => {
    haptics.tap();
    player.playTracks(tracks, index);
  };
  const onMore = (track: AppTrack, index: number) => openTrackActions(track, { playlist: { id: playlist.id, index } });
  const totalMs = tracks.reduce((sum, t) => sum + t.durationMs, 0);
  const remoteMissing = tracks.filter((t) => t.origin === 'remote' && !t.localUri);
  const cover = playlist.artworkUris;

  return (
    <View style={styles.root}>
      <Backdrop />
      <FlashList
        data={tracks}
        keyExtractor={(t, i) => `${i}:${t.key}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        ListHeaderComponent={
          <DetailHeader
            renderArtwork={(size) => <PlaylistArtwork uris={cover} name={playlist.name} size={size} radius={radius.lg} />}
            backdropUri={cover[0]}
            eyebrow="Playlist"
            title={playlist.name}
            meta={tracks.length ? `${plural(tracks.length, 'track')} · ${humanDuration(totalMs)}` : 'Empty playlist'}
            onPlay={tracks.length ? () => player.playTracks(tracks, 0) : undefined}
            onShuffle={tracks.length ? () => player.playTracks(tracks, undefined, { shuffle: true }) : undefined}
            actions={
              <>
                {remoteMissing.length > 0 ? (
                  <IconButton
                    icon="arrow-down-circle-outline"
                    label="Download playlist"
                    variant="filled"
                    haptic
                    onPress={() => {
                      downloadTracks(remoteMissing);
                      showToast(`Downloading ${plural(remoteMissing.length, 'track')}`);
                    }}
                  />
                ) : null}
                <IconButton
                  icon="ellipsis-horizontal"
                  label="Playlist options"
                  variant="filled"
                  onPress={() => openPlaylistActions(playlist, { onDeleted: () => router.back() })}
                />
              </>
            }
          />
        }
        ListEmptyComponent={
          <EmptyState icon="musical-notes-outline" title="No songs yet" message="Long-press any song and choose “Add to playlist”." />
        }
        renderItem={({ item, index }) => <TrackRow track={item} index={index} onPress={play} onMore={onMore} subtitle="artist-album" />}
      />
      <FloatingBack />
      <DockedMiniPlayer />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center' },
}));
