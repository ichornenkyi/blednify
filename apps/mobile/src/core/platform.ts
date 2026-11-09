import { Platform } from 'react-native';

/**
 * Features that need the app's own file storage: importing files from the device, offline downloads and
 * uploading files to the server. Off in the web app (installable on iOS from Safari), which streams only.
 */
export const fileStorageSupported = Platform.OS !== 'web';
