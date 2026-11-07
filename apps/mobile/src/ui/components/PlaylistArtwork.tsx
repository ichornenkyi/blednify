import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, radius as radii } from '../theme';
import { Artwork, sizedArtworkUri } from './Artwork';

/** 2×2 mosaic when a playlist has 4 covers, single cover otherwise, branded fallback when empty. */
export function PlaylistArtwork({ uris, name, size, radius = radii.sm }: { uris: string[]; name: string; size?: number; radius?: number }) {
  if (uris.length < 4) {
    return <Artwork uri={uris[0]} label={name} size={size} radius={radius} fallbackIcon="musical-notes" />;
  }
  const box = size !== undefined ? { width: size, height: size } : styles.fill;
  return (
    <View style={[styles.grid, box, { borderRadius: radius }]}>
      {uris.slice(0, 4).map((uri, i) => (
        <Image key={i} source={sizedArtworkUri(uri, size && size / 2)} style={styles.cell} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={120} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', backgroundColor: colors.surface2 },
  fill: { width: '100%', aspectRatio: 1 },
  cell: { width: '50%', height: '50%' },
});
