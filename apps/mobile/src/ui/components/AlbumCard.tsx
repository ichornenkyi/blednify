import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, space } from '../theme';
import { Artwork } from './Artwork';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type AlbumCardProps = {
  title: string;
  subtitle?: string;
  artworkUri: string | null;
  /** Fixed width for rails; omit inside grids to fill the column. */
  width?: number;
  round?: boolean;
  recyclingKey?: string;
  onPress: () => void;
  onLongPress?: () => void;
};

function AlbumCardImpl({ title, subtitle, artworkUri, width, round, recyclingKey, onPress, onLongPress }: AlbumCardProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, width !== undefined ? { width } : styles.flex]}>
      <Artwork uri={artworkUri} label={title} size={width} round={round} radius={radius.md} recyclingKey={recyclingKey} />
      <View style={[styles.meta, round && styles.center]}>
        <Text variant="bodyStrong" numberOfLines={1} style={round && styles.centerText}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1} style={round && styles.centerText}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

export const AlbumCard = memo(AlbumCardImpl);

const styles = StyleSheet.create({
  card: { gap: space.sm },
  flex: { flex: 1 },
  meta: { gap: 2 },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
});
