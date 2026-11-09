/**
 * Audio backend used by the engine. Native: expo-audio (ExoPlayer / AVQueuePlayer).
 * Web: `audio.web.ts`, a single-<audio>-element playlist (see there for why not expo-audio's web playlist).
 */
export {
  createAudioPlaylist,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioPlaylist,
  type AudioPlaylistStatus,
} from 'expo-audio';
