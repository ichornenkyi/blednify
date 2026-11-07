import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { downloadTracks, player, supportsOffline, useAlbum, type AppTrack } from '@/core';
import { Artwork } from '@/ui/components/Artwork';
import { DetailHeader } from '@/ui/components/DetailHeader';
import { EmptyState } from '@/ui/components/EmptyState';
import { IconButton } from '@/ui/components/IconButton';
import { Loading } from '@/ui/components/Loading';
import { DockedMiniPlayer } from '@/ui/components/MiniPlayer';
import { PlaylistPicker } from '@/ui/components/PlaylistPicker';
import { PrimaryButton } from '@/ui/components/PrimaryButton';
import { FloatingBack } from '@/ui/components/ScreenHeader';
import { openTrackActions } from '@/ui/components/TrackActions';
import { TrackRow } from '@/ui/components/TrackRow';
import { humanDuration, plural } from '@/ui/format';
import { haptics } from '@/ui/haptics';
import { nav, parseOrigin } from '@/ui/nav';
import { showSheet, showToast } from '@/ui/overlay';
import { colors, radius, space } from '@/ui/theme';

const onMore = (track: AppTrack) => openTrackActions(track, { hideAlbum: true });

export default function AlbumScreen() {
  const params = useLocalSearchParams<{ id: string; origin?: string }>();
  const origin = parseOrigin(params.origin);
  const insets = useSafeAreaInsets();
  const { album, tracks, isLoading } = useAlbum(params.id, origin);

  if (!album) {
    return (
      <View style={styles.root}>
        {isLoading ? (
          <Loading />
        ) : (
          <View style={[styles.root, styles.center]}>
            <EmptyState icon="disc-outline" title="Album not found" message="It may have been removed from the server or this device.">
              <PrimaryButton label="Go back" variant="surface" onPress={() => router.back()} />
            </EmptyState>
          </View>
        )}
        <FloatingBack />
      </View>
    );
  }

  const play = (index: number) => {
    haptics.tap();
    player.playTracks(tracks, index);
  };
  const remoteMissing = tracks.filter((t) => t.origin === 'remote' && !t.localUri);
  const meta = [album.year, plural(album.trackCount || tracks.length, 'track'), album.durationMs > 0 ? humanDuration(album.durationMs) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root}>
      <FlashList
        data={tracks}
        keyExtractor={(t) => t.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        ListHeaderComponent={
          <DetailHeader
            renderArtwork={(size) => <Artwork uri={album.artworkUri} label={album.title} size={size} radius={radius.lg} priority="high" />}
            backdropUri={album.artworkUri}
            eyebrow={origin === 'local' ? 'Album · On this device' : 'Album'}
            title={album.title}
            subtitle={album.artist}
            onSubtitlePress={() => nav.artist(album.artistId, album.origin)}
            meta={meta}
            onPlay={tracks.length ? () => player.playTracks(tracks, 0) : undefined}
            onShuffle={tracks.length ? () => player.playTracks(tracks, undefined, { shuffle: true }) : undefined}
            actions={
              <>
                {supportsOffline && remoteMissing.length > 0 ? (
                  <IconButton
                    icon="arrow-down-circle-outline"
                    label="Download album"
                    variant="filled"
                    haptic
                    onPress={() => {
                      downloadTracks(remoteMissing);
                      showToast(`Downloading ${plural(remoteMissing.length, 'track')}`);
                    }}
                  />
                ) : null}
                <IconButton
                  icon="add"
                  label="Add album to playlist"
                  variant="filled"
                  disabled={!tracks.length}
                  onPress={() => showSheet(<PlaylistPicker tracks={tracks} />)}
                />
              </>
            }
          />
        }
        ListEmptyComponent={isLoading ? <Loading /> : null}
        renderItem={({ item, index }) => <TrackRow track={item} index={index} onPress={play} onMore={onMore} leading="number" showDuration />}
      />
      <FloatingBack />
      <DockedMiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center' },
});
