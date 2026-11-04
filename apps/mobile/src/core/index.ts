// Public API of the core layer — see docs/MOBILE_ARCH.md. UI imports only from '@/core'.

export type {
  AlbumView,
  AppTrack,
  ArtistView,
  DownloadStatus,
  Origin,
  PlayerState,
  Playlist,
  RepeatMode,
} from './types';

// Provider
export { CoreProvider } from './provider';

// Server catalog
export {
  testServer,
  useAlbum,
  useArtist,
  useRemoteAlbums,
  useRemoteTracks,
  useSearch,
  useServerStatus,
} from './catalog';

// Local library
export {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  toggleLike,
  useIsLiked,
  useLikedTracks,
  useLocalAlbums,
  useLocalTracks,
  usePlaylist,
  usePlaylists,
  useRecentlyPlayed,
} from './library';

// Player
export { player } from './player/engine';
export { usePlayer, useProgress } from './player/store';

// Downloads
export { cancelDownload, downloadTracks, removeDownload, useDownloadState, useDownloads } from './downloads';

// Import
export { deleteLocalTrack, importFromDevice } from './import/importer';

// Settings
export { useSettings } from './settings';

// Utilities
export { formatBytes, formatDuration } from './format';
