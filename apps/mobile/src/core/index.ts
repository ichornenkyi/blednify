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

// Search history
export {
  clearSearchHistory,
  pushSearchAlbum,
  pushSearchArtist,
  pushSearchQuery,
  pushSearchTrack,
  removeSearchEntry,
  searchHistoryStore,
  useSearchHistory,
  type SearchHistoryAlbum,
  type SearchHistoryArtist,
  type SearchHistoryEntry,
  type SearchHistoryQuery,
  type SearchHistoryTrack,
} from './search-history';

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

// Lyrics
export { activeLyricIndex, hasLyrics, useLyrics, type LyricLine, type Lyrics } from './lyrics';

// Admin (server uploads / delete / rescan)
export {
  cancelUpload,
  checkAdmin,
  clearUploads,
  deleteFromServer,
  pickAndUpload,
  rescanServer,
  retryUpload,
  uploadLocalTracks,
  useUploads,
  type UploadItem,
  type UploadStatus,
} from './admin';

// Settings
export { saveConnection, useSettings } from './settings';

// Images (adds the access token for server URLs)
export { imageSourceFor, useImageSource, type ImageSource } from './auth';

// Utilities
export { formatBytes, formatDuration } from './format';
