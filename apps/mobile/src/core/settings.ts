import { createMMKV } from 'react-native-mmkv';
import { create, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { queryClient } from './query-client';

/** Single synchronous key-value store for settings and small persisted state. */
export const kv = createMMKV({ id: 'blednify' });

const K_SERVER = 'settings.serverUrl';
const K_WIFI = 'settings.downloadOnWifiOnly';
const K_TOKEN = 'settings.accessToken';
const K_ADMIN = 'settings.adminMode';
const K_ADMIN_TOKEN = 'settings.adminToken';
const K_LYRICS_ONLINE = 'settings.lyricsOnline';

type SettingsValues = {
  serverUrl: string;
  accessToken: string;
  downloadOnWifiOnly: boolean;
  /** Shows upload / delete / rescan tools for the configured server. */
  adminMode: boolean;
  /** The server's ADMIN_TOKEN; only sent with admin requests. */
  adminToken: string;
  /** Look up lyrics of imported tracks on lrclib.net (server tracks use the server's lookup). */
  lyricsOnline: boolean;
};

export const settingsStore = create<SettingsValues>(() => ({
  serverUrl: kv.getString(K_SERVER) ?? process.env.EXPO_PUBLIC_API_URL ?? '',
  accessToken: kv.getString(K_TOKEN) ?? '',
  downloadOnWifiOnly: kv.getBoolean(K_WIFI) ?? true,
  adminMode: kv.getBoolean(K_ADMIN) ?? false,
  adminToken: kv.getString(K_ADMIN_TOKEN) ?? '',
  lyricsOnline: kv.getBoolean(K_LYRICS_ONLINE) ?? true,
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

/** Saves the server address and access token together, then refetches everything against them. */
export function saveConnection(url: string, token: string): void {
  setServerUrl(url);
  kv.set(K_TOKEN, token.trim());
  settingsStore.setState({ accessToken: token.trim() });
  void queryClient.invalidateQueries();
}

function setDownloadOnWifiOnly(v: boolean) {
  kv.set(K_WIFI, v);
  settingsStore.setState({ downloadOnWifiOnly: v });
}

function setAdminMode(v: boolean) {
  kv.set(K_ADMIN, v);
  settingsStore.setState({ adminMode: v });
}

function setAdminToken(token: string) {
  kv.set(K_ADMIN_TOKEN, token.trim());
  settingsStore.setState({ adminToken: token.trim() });
}

function setLyricsOnline(v: boolean) {
  kv.set(K_LYRICS_ONLINE, v);
  settingsStore.setState({ lyricsOnline: v });
}

export function useSettings(): SettingsValues & {
  setServerUrl(url: string): void;
  setDownloadOnWifiOnly(v: boolean): void;
  setAdminMode(v: boolean): void;
  setAdminToken(token: string): void;
  setLyricsOnline(v: boolean): void;
} {
  const values = useStore(settingsStore, useShallow((s) => s));
  return { ...values, setServerUrl, setDownloadOnWifiOnly, setAdminMode, setAdminToken, setLyricsOnline };
}
