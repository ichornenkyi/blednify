import { Image } from 'expo-image';
import { View } from 'react-native';

import { makeStyles, radius as radii } from '../theme';
import { Artwork } from './Artwork';
import { useImageSource } from '@/core';

/** Assumed width, in points, of a mosaic that fills its parent. */
const FILL_WIDTH = 170;

function Cell({ uri, size }: { uri: string; size?: number }) {
  const styles = useStyles();
  const source = useImageSource(uri, (size ?? FILL_WIDTH) / 2);
  return <Image source={source} style={styles.cell} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={120} />;
}

/** 2×2 mosaic when a playlist has 4 covers, single cover otherwise, branded fallback when empty. */
export function PlaylistArtwork({ uris, name, size, radius = radii.sm }: { uris: string[]; name: string; size?: number; radius?: number }) {
  const styles = useStyles();
  if (uris.length < 4) {
    return <Artwork uri={uris[0]} label={name} size={size} radius={radius} fallbackIcon="musical-notes" />;
  }
  const box = size !== undefined ? { width: size, height: size } : styles.fill;
  return (
    <View style={[styles.grid, box, { borderRadius: radius }]}>
      {uris.slice(0, 4).map((uri, i) => (
        <Cell key={i} uri={uri} size={size} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', backgroundColor: colors.surface2 },
  fill: { width: '100%', aspectRatio: 1 },
  cell: { width: '50%', height: '50%' },
}));
