import { Image } from 'expo-image';

import { appIconById, useAppIcon } from '@/core';

/** Blednify brand mark: the launcher icon the user picked (Settings → App icon), with rounded corners. */
export function BrandMark({ size = 56 }: { size?: number }) {
  const icon = appIconById(useAppIcon());
  return (
    <Image
      source={icon.image}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      contentFit="cover"
      accessibilityLabel="Blednify"
    />
  );
}
