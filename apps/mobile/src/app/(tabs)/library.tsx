import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  player,
  useLikedTracks,
  useLocalAlbums,
  useLocalTracks,
  usePlaylists,
  useRecentlyPlayed,
  useRemoteAlbums,
  type AlbumView,
  type AppTrack,
} from '@/core';
import { importMusic } from '@/ui/actions';
import { AlbumCard } from '@/ui/components/AlbumCard';
import { Chip } from '@/ui/components/Chip';
import { EmptyState } from '@/ui/components/EmptyState';
import { Icon } from '@/ui/components/Icon';
import { IconButton } from '@/ui/components/IconButton';
import { ListRow } from '@/ui/components/ListRow';
import { PlaylistArtwork } from '@/ui/components/PlaylistArtwork';
import { openPlaylistActions, promptNewPlaylist } from '@/ui/components/PlaylistActions';
import { PrimaryButton } from '@/ui/components/PrimaryButton';
import { Text } from '@/ui/components/Text';
import { onTrackMore } from '@/ui/components/TrackActions';
import { TrackRow } from '@/ui/components/TrackRow';
import { haptics } from '@/ui/haptics';
import { nav, type LibraryFilter } from '@/ui/nav';
import { colors, radius, space } from '@/ui/theme';

type TabFilter = LibraryFilter | 'recents';

const FILTERS: { key: TabFilter; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'recents', label: 'Recents' },
  { key: 'albums', label: 'Albums' },
  { key: 'liked', label: 'Liked' },
  { key: 'downloaded', label: 'Downloaded' },
  { key: 'device', label: 'On this device' },
];

function isFilter(v: unknown): v is TabFilter {
  return FILTERS.some((f) => f.key === v);
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  // The route param is the single source of truth, so shortcuts (Home → Liked) always win over a stale chip.
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter: TabFilter = isFilter(params.filter) ? params.filter : 'playlists';

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.header}>
        <Text variant="display" style={styles.flex}>
          Library
        </Text>
        <IconButton icon="add" label="New playlist" size={26} onPress={promptNewPlaylist} />
        <IconButton icon="folder-open-outline" label="Import music from device" onPress={importMusic} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => router.setParams({ filter: f.key })} />
        ))}
      </ScrollView>
      {filter === 'playlists' ? <PlaylistsList /> : null}
      {filter === 'recents' ? <RecentsList /> : null}
      {filter === 'albums' ? <AlbumsGrid /> : null}
      {filter === 'liked' ? <LikedList /> : null}
      {filter === 'downloaded' ? <DownloadedList /> : null}
      {filter === 'device' ? <DeviceList /> : null}
    </View>
  );
}

function PlaylistsList() {
  const playlists = usePlaylists();
  return (
    <FlashList
      data={playlists}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <ListRow
          leading={
            <View style={styles.newTile}>
              <Icon name="add" size={28} color={colors.accent} />
            </View>
          }
          title="New playlist"
          onPress={promptNewPlaylist}
        />
      }
      ListEmptyComponent={<EmptyState icon="list" title="No playlists yet" message="Create one, then long-press any song to add it." />}
      renderItem={({ item }) => (
        <ListRow
          leading={<PlaylistArtwork uris={item.artworkUris} name={item.name} size={56} />}
          title={item.name}
          subtitle={`Playlist · ${item.trackCount} ${item.trackCount === 1 ? 'track' : 'tracks'}`}
          onPress={() => nav.playlist(item.id)}
          onLongPress={() => {
            haptics.press();
            openPlaylistActions(item);
          }}
        />
      )}
    />
  );
}

function AlbumsGrid() {
  const local = useLocalAlbums();
  const { albums: remote } = useRemoteAlbums();
  const seen = new Set<string>();
  const albums: AlbumView[] = [];
  for (const a of [...local, ...remote]) {
    const k = `${a.origin}:${a.id}`;
    if (!seen.has(k)) {
      seen.add(k);
      albums.push(a);
    }
  }
  return (
    <FlashList
      data={albums}
      numColumns={2}
      keyExtractor={(a) => `${a.origin}:${a.id}`}
      contentContainerStyle={styles.gridContent}
      ListEmptyComponent={
        <EmptyState icon="disc-outline" title="No albums yet" message="Import music or connect your server to see albums here.">
          <PrimaryButton label="Import music" icon="add" variant="surface" onPress={importMusic} />
        </EmptyState>
      }
      renderItem={({ item }) => (
        <View style={styles.gridCell}>
          <AlbumCard
            title={item.title}
            subtitle={item.year ? `${item.artist} · ${item.year}` : item.artist}
            artworkUri={item.artworkUri}
            recyclingKey={`${item.origin}:${item.id}`}
            onPress={() => nav.album(item.id, item.origin)}
          />
        </View>
      )}
    />
  );
}

function RecentsList() {
  const tracks = useRecentlyPlayed(50);
  return (
    <TrackList
      tracks={tracks}
      empty={<EmptyState icon="time-outline" title="No recently played songs" message="Tracks you play will appear here." />}
    />
  );
}

function LikedList() {
  const tracks = useLikedTracks();
  return (
    <TrackList
      tracks={tracks}
      empty={<EmptyState icon="heart-outline" title="Nothing liked yet" message="Tap the heart in the player to save songs here." />}
    />
  );
}

function DownloadedList() {
  const tracks = useLocalTracks().filter((t) => t.origin === 'remote');
  return (
    <TrackList
      tracks={tracks}
      extra={<IconButton icon="settings-outline" label="Manage downloads" variant="filled" onPress={nav.downloads} />}
      empty={
        <EmptyState
          icon="arrow-down-circle-outline"
          title="No downloads"
          message="Download server tracks to listen offline. Long-press a song or use the download button in the player."
        />
      }
    />
  );
}

function DeviceList() {
  const tracks = useLocalTracks().filter((t) => t.origin === 'local');
  return (
    <TrackList
      tracks={tracks}
      extra={<IconButton icon="add" label="Import music" variant="filled" onPress={importMusic} />}
      empty={
        <EmptyState
          icon="phone-portrait-outline"
          title="No music on this device"
          message="Import audio files from your phone. They stay on this phone.">
          <PrimaryButton label="Import music" icon="add" onPress={importMusic} />
        </EmptyState>
      }
    />
  );
}

function TrackList({ tracks, empty, extra }: { tracks: AppTrack[]; empty: ReactElement; extra?: ReactNode }) {
  const play = (index: number) => {
    haptics.tap();
    player.playTracks(tracks, index);
  };
  return (
    <FlashList
      data={tracks}
      keyExtractor={(t) => t.key}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={empty}
      ListHeaderComponent={
        tracks.length > 0 ? (
          <View style={styles.playRow}>
            <Text variant="caption" style={styles.flex}>
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </Text>
            {extra}
            <IconButton icon="shuffle" label="Shuffle" variant="filled" haptic onPress={() => player.playTracks(tracks, undefined, { shuffle: true })} />
            <IconButton icon="play" label="Play all" variant="accent" haptic size={22} diameter={48} onPress={() => player.playTracks(tracks, 0)} />
          </View>
        ) : null
      }
      renderItem={({ item, index }) => <TrackRow track={item} index={index} onPress={play} onMore={onTrackMore} subtitle="artist-album" />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.sm, marginBottom: space.md },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.md },
  listContent: { paddingBottom: space.xl },
  gridContent: { paddingHorizontal: space.md, paddingBottom: space.xl },
  gridCell: { flex: 1, paddingHorizontal: space.xs + 2, paddingBottom: space.lg },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.lg, paddingRight: space.md, paddingVertical: space.sm },
  newTile: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
});
