import { Image } from 'expo-image';

// The app icon itself (rendered from assets/icon.svg by tools/brand/build-icons.ts). Its glow and frosted glass
// use blur filters, which react-native-svg does not draw reliably, so the in-app mark is the same PNG.
const ICON = require('../../../assets/images/icon.png');

/** Blednify brand mark: the app icon with its squircle corners. */
export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <Image
      source={ICON}
      style={{ width: size, height: size, borderRadius: size * (232 / 1024) }}
      contentFit="cover"
      accessibilityLabel="Blednify"
    />
  );
}
