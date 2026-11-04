import { createMMKV } from 'react-native-mmkv';
import { create, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/** Single synchronous key-value store for settings and small persisted state. */
export const kv = createMMKV({ id: 'blednify' });

const K_SERVER = 'settings.serverUrl';
const K_WIFI = 'settings.downloadOnWifiOnly';

type SettingsValues = { serverUrl: string; downloadOnWifiOnly: boolean };

export const settingsStore = create<SettingsValues>(() => ({
  serverUrl: kv.getString(K_SERVER) ?? process.env.EXPO_PUBLIC_API_URL ?? '',
  downloadOnWifiOnly: kv.getBoolean(K_WIFI) ?? true,
}));

/** Canonical base URL: trimmed, scheme added if missing, no trailing slash. Empty ⇒ offline mode. */
export function normalizeServerUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  if (!u) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `http://${u}`;
}

export const getServerBase = (): string => normalizeServerUrl(settingsStore.getState().serverUrl);

export function useServerBase(): string {
  return normalizeServerUrl(useStore(settingsStore, (s) => s.serverUrl));
}

function setServerUrl(url: string) {
  const v = url.trim();
  kv.set(K_SERVER, v);
  settingsStore.setState({ serverUrl: v });
}

function setDownloadOnWifiOnly(v: boolean) {
  kv.set(K_WIFI, v);
  settingsStore.setState({ downloadOnWifiOnly: v });
}

export function useSettings(): {
  serverUrl: string;
  setServerUrl(url: string): void;
  downloadOnWifiOnly: boolean;
  setDownloadOnWifiOnly(v: boolean): void;
} {
  const { serverUrl, downloadOnWifiOnly } = useStore(settingsStore, useShallow((s) => s));
  return { serverUrl, setServerUrl, downloadOnWifiOnly, setDownloadOnWifiOnly };
}
