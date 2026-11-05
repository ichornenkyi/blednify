import { Platform } from 'react-native';

/** Downloads and file import need a real file system; the web app is streaming only. */
export const supportsOffline = Platform.OS !== 'web';
