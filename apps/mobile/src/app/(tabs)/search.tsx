import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  clearSearchHistory,
  player,
  pushSearchAlbum,
  pushSearchArtist,
  pushSearchQuery,
  pushSearchTrack,
  removeSearchEntry,
  useSearch,
  useSearchHistory,
  type AlbumView,
  type AppTrack,
  type ArtistView,
  type SearchHistoryEntry,
} from '@/core';
import { importMusic } from '@/ui/actions';
import { Backdrop } from '@/ui/components/Backdrop';
import { Artwork } from '@/ui/components/Artwork';
import { EmptyState } from '@/ui/components/EmptyState';
import { Icon, type IconName } from '@/ui/components/Icon';
import { IconButton } from '@/ui/components/IconButton';
import { ListRow } from '@/ui/components/ListRow';
import { PressableScale } from '@/ui/components/PressableScale';
import { PrimaryButton } from '@/ui/components/PrimaryButton';
import { Text } from '@/ui/components/Text';
import { onTrackMore } from '@/ui/components/TrackActions';
import { TrackRow } from '@/ui/components/TrackRow';
import { haptics } from '@/ui/haptics';
import { nav, type LibraryFilter } from '@/ui/nav';
import { makeStyles, radius, space, useColors } from '@/ui/theme';

type Item =
  | { type: 'header'; key: string; title: string }
  | { type: 'track'; key: string; track: AppTrack; index: number }
  | { type: 'album'; key: string; album: AlbumView }
  | { type: 'artist'; key: string; artist: ArtistView };

const TRACK_LIMIT = 30;

export default function SearchScreen() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const deferred = useDeferredValue(query.trim());
  const history = useSearchHistory();
  const { tracks, albums, artists, isLoading } = useSearch(deferred);

  const shownTracks = tracks.slice(0, TRACK_LIMIT);
  const items: Item[] = [];
  if (deferred) {
    if (shownTracks.length) {
      items.push({ type: 'header', key: 'h:tracks', title: 'Tracks' });
      shownTracks.forEach((track, index) => items.push({ type: 'track', key: track.key, track, index }));
    }
    if (artists.length) {
      items.push({ type: 'header', key: 'h:artists', title: 'Artists' });
      artists.forEach((artist) => items.push({ type: 'artist', key: `ar:${artist.origin}:${artist.id}`, artist }));
    }
    if (albums.length) {
      items.push({ type: 'header', key: 'h:albums', title: 'Albums' });
      albums.forEach((album) => items.push({ type: 'album', key: `al:${album.origin}:${album.id}`, album }));
    }
  }

  const playAt = (index: number) => {
    haptics.tap();
    Keyboard.dismiss();
    const track = shownTracks[index];
    if (track) pushSearchTrack(track);
    player.playTracks(shownTracks, index);
  };

  const handleRecentPress = (entry: SearchHistoryEntry) => {
    if (entry.kind === 'query') {
      setQuery(entry.query);
    } else if (entry.kind === 'track') {
      haptics.tap();
      Keyboard.dismiss();
      pushSearchTrack(entry.track);
      player.playTracks([entry.track], 0);
    } else if (entry.kind === 'artist') {
      pushSearchArtist(entry.artist);
      nav.artist(entry.artist.id, entry.artist.origin);
    } else if (entry.kind === 'album') {
      pushSearchAlbum(entry.album);
      nav.album(entry.album.id, entry.album.origin);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <Backdrop />
      <Text variant="display" style={styles.title}>
        Search
      </Text>
      <View style={styles.field}>
        <Icon name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={() => {
            const q = query.trim();
            if (q) pushSearchQuery(q);
          }}
          placeholder="Songs, artists, albums"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          style={styles.input}
        />
        {isLoading && deferred ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
            <Icon name="close-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {!deferred ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          {history.length > 0 ? (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text variant="subheading">Recent searches</Text>
              </View>
              {(isFocused ? history : history.slice(0, 5)).map((entry) => (
                <RecentHistoryRow
                  key={entry.id}
                  entry={entry}
                  onPress={() => handleRecentPress(entry)}
                  onRemove={() => removeSearchEntry(entry.id)}
                />
              ))}
              {isFocused ? (
                <View style={styles.clearBtnWrap}>
                  <PrimaryButton label="Clear recent searches" variant="surface" onPress={clearSearchHistory} />
                </View>
              ) : null}
            </View>
          ) : null}
          {!isFocused || history.length === 0 ? <BrowseGrid /> : null}
        </ScrollView>
      ) : items.length === 0 && !isLoading ? (
        <EmptyState icon="search" title={`No results for “${deferred}”`} message="Try a different spelling, or search by artist or album." />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            switch (item.type) {
              case 'header':
                return (
                  <Text variant="subheading" style={styles.section}>
                    {item.title}
                  </Text>
                );
              case 'track':
                return <TrackRow track={item.track} index={item.index} onPress={playAt} onMore={onTrackMore} subtitle="artist-album" />;
              case 'artist':
                return (
                  <ListRow
                    leading={<Artwork uri={item.artist.artworkUri} label={item.artist.name} size={48} round recyclingKey={item.key} />}
                    title={item.artist.name}
                    subtitle={`Artist · ${item.artist.trackCount} ${item.artist.trackCount === 1 ? 'track' : 'tracks'}`}
                    chevron
                    onPress={() => {
                      pushSearchArtist(item.artist);
                      nav.artist(item.artist.id, item.artist.origin);
                    }}
                  />
                );
              case 'album':
                return (
                  <ListRow
                    leading={<Artwork uri={item.album.artworkUri} label={item.album.title} size={48} recyclingKey={item.key} />}
                    title={item.album.title}
                    subtitle={`Album · ${item.album.artist}${item.album.year ? ` · ${item.album.year}` : ''}`}
                    chevron
                    onPress={() => {
                      pushSearchAlbum(item.album);
                      nav.album(item.album.id, item.album.origin);
                    }}
                  />
                );
            }
          }}
        />
      )}
    </View>
  );
}

function RecentHistoryRow({
  entry,
  onPress,
  onRemove,
}: {
  entry: SearchHistoryEntry;
  onPress: () => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  let leading: ReactNode;
  let title: string;
  let subtitle: string | undefined;

  switch (entry.kind) {
    case 'track':
      leading = <Artwork uri={entry.track.artworkUri} label={entry.track.title} size={48} recyclingKey={entry.id} />;
      title = entry.track.title;
      subtitle = `Song · ${entry.track.artist}`;
      break;
    case 'artist':
      leading = <Artwork uri={entry.artist.artworkUri} label={entry.artist.name} size={48} round recyclingKey={entry.id} />;
      title = entry.artist.name;
      subtitle = 'Artist';
      break;
    case 'album':
      leading = <Artwork uri={entry.album.artworkUri} label={entry.album.title} size={48} recyclingKey={entry.id} />;
      title = entry.album.title;
      subtitle = `Album · ${entry.album.artist}`;
      break;
    case 'query':
      leading = (
        <View style={styles.queryIconContainer}>
          <Icon name="search" size={20} color={colors.textSecondary} />
        </View>
      );
      title = entry.query;
      subtitle = undefined;
      break;
  }

  return (
    <ListRow
      leading={leading}
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      trailing={
        <IconButton
          icon="close"
          label="Remove"
          size={18}
          diameter={32}
          color={colors.textTertiary}
          onPress={onRemove}
        />
      }
    />
  );
}

const BROWSE: { label: string; icon: IconName; colors: readonly [string, string]; filter?: LibraryFilter; action?: () => void }[] = [
  { label: 'Liked songs', icon: 'heart', colors: ['#E5383B', '#6A1214'], filter: 'liked' },
  { label: 'Downloaded', icon: 'arrow-down-circle', colors: ['#2B5876', '#101C2B'], filter: 'downloaded' },
  { label: 'On this device', icon: 'phone-portrait', colors: ['#1F8A70', '#0B2B24'], filter: 'device' },
  { label: 'Playlists', icon: 'list', colors: ['#8E2DE2', '#2A0E4A'], filter: 'playlists' },
  { label: 'Albums', icon: 'disc', colors: ['#C06C2B', '#3B1A08'], filter: 'albums' },
  { label: 'Import music', icon: 'add-circle', colors: ['#4A5BD6', '#141A45'], action: importMusic },
];

function BrowseGrid() {
  const styles = useStyles();
  return (
    <View style={styles.browse}>
      <Text variant="subheading" style={styles.browseTitle}>
        Browse your library
      </Text>
      <View style={styles.grid}>
        {BROWSE.map((b) => (
          <PressableScale
            key={b.label}
            accessibilityRole="button"
            accessibilityLabel={b.label}
            style={styles.tile}
            onPress={() => (b.action ? b.action() : nav.library(b.filter))}>
            <LinearGradient colors={b.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileFill}>
              <Text variant="subheading" numberOfLines={2} style={styles.tileLabel}>
                {b.label}
              </Text>
              <View style={styles.tileIcon}>
                <Icon name={b.icon} size={40} color="rgba(255,255,255,0.85)" />
              </View>
            </LinearGradient>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  title: { paddingHorizontal: space.lg, marginBottom: space.md },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  input: { flex: 1, height: '100%', color: colors.text, fontSize: 16, fontWeight: '500' },
  listContent: { paddingBottom: space.xl },
  scrollContent: { paddingBottom: space.xxl },
  section: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  recentSection: { paddingBottom: space.md },
  recentHeader: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  queryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnWrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  browse: { paddingHorizontal: space.lg, paddingTop: space.md },
  browseTitle: { marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47.5%', flexGrow: 1, height: 96, borderRadius: radius.md, overflow: 'hidden' },
  tileFill: { flex: 1, padding: space.md },
  tileLabel: { maxWidth: '70%' },
  tileIcon: { position: 'absolute', right: -4, bottom: -6, transform: [{ rotate: '-14deg' }] },
}));
