import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { create, useStore } from 'zustand';

import { APP_ICONS, type AppIconId } from '@/assets/app-icons';

/** modules/app-icon: flips the launcher activity aliases that plugins/with-app-icons.js declares (Android only). */
type AppIconNative = {
  getIcon(ids: string[]): string | null;
  setIcon(id: string, ids: string[]): void;
};

const native = Platform.OS === 'android' ? requireOptionalNativeModule<AppIconNative>('AppIcon') : null;
const IDS = APP_ICONS.map((i) => i.id);
const DEFAULT: AppIconId = APP_ICONS[0].id;

function readIcon(): AppIconId {
  try {
    const id = native?.getIcon(IDS);
    return (IDS as readonly string[]).includes(id ?? '') ? (id as AppIconId) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** The launcher icon in use. The alias states in the OS are the source of truth, so nothing is persisted here. */
export const appIconStore = create<{ id: AppIconId }>(() => ({ id: readIcon() }));

/** Whether this build can change its launcher icon. */
export const appIconSupported = native != null;

export const useAppIcon = (): AppIconId => useStore(appIconStore, (s) => s.id);

export function setAppIcon(id: AppIconId): void {
  if (!native || id === appIconStore.getState().id) return;
  native.setIcon(id, IDS);
  appIconStore.setState({ id });
}

export const appIconById = (id: AppIconId) => APP_ICONS.find((i) => i.id === id) ?? APP_ICONS[0];
export { APP_ICONS, type AppIconId };
