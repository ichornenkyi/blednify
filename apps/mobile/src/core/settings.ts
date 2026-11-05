import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { create, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/** Single synchronous key-value store for settings and small persisted state. */
export const kv = createMMKV({ id: 'blednify' });

const K_SERVER = 'settings.serverUrl';
const K_WIFI = 'settings.downloadOnWifiOnly';
const K_ADMIN_TOKEN = 'settings.adminToken';

type SettingsValues = { serverUrl: string; downloadOnWifiOnly: boolean; adminToken: string };

/** The web app is normally served by the music server itself, so its own origin is the default. */
const defaultServerUrl = (): string =>
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? window.location.origin : '');

export const settingsStore = create<SettingsValues>(() => ({
  serverUrl: kv.getString(K_SERVER) ?? defaultServerUrl(),
  downloadOnWifiOnly: kv.getBoolean(K_WIFI) ?? true,
  adminToken: kv.getString(K_ADMIN_TOKEN) ?? '',
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

function setAdminToken(token: string) {
  const v = token.trim();
  kv.set(K_ADMIN_TOKEN, v);
  settingsStore.setState({ adminToken: v });
}

export function useSettings(): {
  serverUrl: string;
  setServerUrl(url: string): void;
  downloadOnWifiOnly: boolean;
  setDownloadOnWifiOnly(v: boolean): void;
  adminToken: string;
  setAdminToken(token: string): void;
} {
  const { serverUrl, downloadOnWifiOnly, adminToken } = useStore(settingsStore, useShallow((s) => s));
  return { serverUrl, setServerUrl, downloadOnWifiOnly, setDownloadOnWifiOnly, adminToken, setAdminToken };
}
