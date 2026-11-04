import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { cancelDownload, downloadTracks, removeDownload, useDownloadState, type AppTrack } from '@/core';

import { attempt } from '../actions';
import { haptics } from '../haptics';
import { colors } from '../theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { ProgressRing } from './ProgressRing';

/** Download state toggle for a single remote track. Local (imported) tracks show an "on device" badge. */
export function DownloadButton({ track, size = 24 }: { track: AppTrack; size?: number }) {
  const { status, progress } = useDownloadState(track.key);

  if (track.origin === 'local') {
    return <IconButton icon="phone-portrait-outline" label="Stored on this device" size={size} color={colors.textSecondary} disabled />;
  }
  if (status === 'queued' || status === 'downloading') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Downloading ${Math.round(progress * 100)} percent. Cancel`}
        onPress={() => {
          haptics.tap();
          cancelDownload(track.key);
        }}
        style={styles.box}>
        <View style={styles.ring}>
          <ProgressRing progress={status === 'queued' ? 0 : progress} size={size} />
        </View>
        <Icon name="stop" size={size * 0.36} color={colors.accent} />
      </Pressable>
    );
  }
  if (status === 'done') {
    return (
      <IconButton
        icon="arrow-down-circle"
        label="Downloaded. Remove download"
        size={size + 2}
        color={colors.accent}
        onPress={() =>
          Alert.alert('Remove download?', `“${track.title}” will still be available to stream.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => void attempt(removeDownload(track.key), 'Download removed') },
          ])
        }
      />
    );
  }
  return (
    <IconButton
      icon={status === 'error' ? 'alert-circle-outline' : 'arrow-down-circle-outline'}
      label={status === 'error' ? 'Download failed. Retry' : 'Download'}
      size={size + 2}
      color={status === 'error' ? colors.danger : colors.text}
      haptic
      onPress={() => downloadTracks([track])}
    />
  );
}

const styles = StyleSheet.create({
  box: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ring: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
