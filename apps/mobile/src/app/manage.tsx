import { FlashList } from "@shopify/flash-list";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  albumTrackKeys,
  deleteTracks,
  formatDuration,
  importFromDevice,
  supportsOffline,
  uploadToServer,
  useLocalAlbums,
  useLocalTracks,
  useRemoteAlbums,
  useRemoteTracks,
  useSettings,
  type AlbumView,
  type AppTrack,
} from "@/core";
import { attempt, confirmAction, errorMessage } from "@/ui/actions";
import { AddMusicSection } from "@/ui/components/AddMusic";
import { Artwork } from "@/ui/components/Artwork";
import { Chip } from "@/ui/components/Chip";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/components/Icon";
import { Loading } from "@/ui/components/Loading";
import { PrimaryButton } from "@/ui/components/PrimaryButton";
import { ScreenHeader } from "@/ui/components/ScreenHeader";
import { Text } from "@/ui/components/Text";
import { plural } from "@/ui/format";
import { haptics } from "@/ui/haptics";
import { dismissToast, showToast } from "@/ui/overlay";
import { colors, radius, space, TRACK_ROW_HEIGHT } from "@/ui/theme";

type Mode = "tracks" | "albums";
type Item = {
  id: string;
  title: string;
  subtitle: string;
  artworkUri: string | null;
  fallbackLabel: string;
  origin: "remote" | "local";
};

const trackItem = (t: AppTrack): Item => ({
  id: t.key,
  title: t.title,
  subtitle: `${t.artist}${t.album ? ` · ${t.album}` : ""} · ${formatDuration(t.durationMs)}${t.origin === "local" ? " · on device" : ""}`,
  artworkUri: t.artworkUri,
  fallbackLabel: t.album || t.title,
  origin: t.origin,
});

const albumId = (a: Pick<AlbumView, "id" | "origin">) => `${a.origin}|${a.id}`;
const albumItem = (a: AlbumView): Item => ({
  id: albumId(a),
  title: a.title,
  subtitle: `${a.artist} · ${plural(a.trackCount, "track")}${a.origin === "local" ? " · on device" : ""}`,
  artworkUri: a.artworkUri,
  fallbackLabel: a.title,
  origin: a.origin,
});

export default function ManageScreen() {
  const insets = useSafeAreaInsets();
  const { adminToken, setAdminToken } = useSettings();
  const [mode, setMode] = useState<Mode>("tracks");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const remote = useRemoteTracks({ q: query, sort: "title" });
  const localTracks = useLocalTracks();
  const remoteAlbums = useRemoteAlbums();
  const localAlbums = useLocalAlbums();

  const q = query.trim().toLowerCase();
  const items = useMemo<Item[]>(() => {
    if (mode === "tracks") {
      const local = q
        ? localTracks.filter((t) =>
            `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q),
          )
        : localTracks;
      return [...local, ...remote.tracks].map(trackItem);
    }
    const all = [...localAlbums, ...remoteAlbums.albums];
    return (
      q
        ? all.filter((a) => `${a.title} ${a.artist}`.toLowerCase().includes(q))
        : all
    ).map(albumItem);
  }, [mode, q, localTracks, remote.tracks, localAlbums, remoteAlbums.albums]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setSelected(new Set());
  };
  const toggle = (id: string) => {
    haptics.select();
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const allSelected =
    items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const runDelete = async () => {
    setBusy(true);
    const toastId = showToast("Deleting…", "progress");
    try {
      const ids = [...selected];
      const keys =
        mode === "tracks"
          ? ids
          : await albumTrackKeys(
              ids.map((id) => {
                const [origin, ...rest] = id.split("|");
                return {
                  origin: origin === "local" ? "local" : "remote",
                  id: rest.join("|"),
                } as const;
              }),
            );
      const res = await deleteTracks(keys);
      dismissToast(toastId);
      setSelected(new Set());
      if (res.failed) {
        haptics.warn();
        showToast(
          `Deleted ${res.deleted}, ${res.failed} failed${res.error ? ` — ${res.error}` : ""}`,
          "error",
        );
      } else {
        haptics.success();
        showToast(`Deleted ${plural(res.deleted, "track")}`, "success");
      }
    } catch (e) {
      dismissToast(toastId);
      haptics.warn();
      showToast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    const n = selected.size;
    const what = mode === "albums" ? plural(n, "album") : plural(n, "track");
    const anyRemote = items.some(
      (i) => selected.has(i.id) && i.origin === "remote",
    );
    confirmAction(
      `Delete ${what}?`,
      anyRemote
        ? "Server files are permanently deleted for every device. Items imported on this phone are removed from it."
        : "These will be removed from this phone.",
      "Delete",
      () => void runDelete(),
    );
  };

  const addToServer = async () => {
    setBusy(true);
    const toastId = showToast("Uploading…", "progress");
    try {
      const res = await uploadToServer((done, total) =>
        showToast(`Uploading ${done}/${total}…`, "progress"),
      );
      dismissToast(toastId);
      if (!res.uploaded && !res.failed) return;
      if (res.failed) {
        haptics.warn();
        showToast(
          `Uploaded ${res.uploaded}, ${res.failed} failed${res.error ? ` — ${res.error}` : ""}`,
          "error",
        );
      } else {
        haptics.success();
        showToast(`Uploaded ${plural(res.uploaded, "track")}`, "success");
      }
    } catch (e) {
      dismissToast(toastId);
      haptics.warn();
      showToast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const importLocal = async () => {
    setBusy(true);
    const r = await attempt(importFromDevice());
    setBusy(false);
    if (r && (r.imported || r.skipped))
      showToast(
        `Imported ${plural(r.imported, "track")}${r.skipped ? ` · ${r.skipped} skipped` : ""}`,
        "success",
      );
  };

  const loading =
    mode === "tracks"
      ? remote.isLoading && !items.length
      : remoteAlbums.isLoading && !items.length;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Manage library"
        right={
          items.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={toggleAll}
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Text variant="bodyStrong" color={colors.accent}>
                {allSelected ? "Clear" : "Select all"}
              </Text>
            </Pressable>
          ) : null
        }
      />

      <FlashList
        data={loading ? [] : items}
        extraData={selected}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: insets.bottom + (selected.size ? 96 : space.xl),
        }}
        onEndReached={mode === "tracks" ? remote.fetchNextPage : undefined}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <View style={styles.toolbar}>
            <TextInput
              value={adminToken}
              onChangeText={setAdminToken}
              placeholder="Server admin token (needed to add or delete)"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              style={styles.tokenInput}
            />
            <View style={styles.addRow}>
              <PrimaryButton
                label="Upload files"
                icon="cloud-upload-outline"
                variant="surface"
                onPress={addToServer}
                disabled={busy}
                style={styles.flex}
              />
              {supportsOffline ? (
                <PrimaryButton
                  label="Import to phone"
                  icon="phone-portrait-outline"
                  variant="surface"
                  onPress={importLocal}
                  disabled={busy}
                  style={styles.flex}
                />
              ) : null}
            </View>
            <AddMusicSection />
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.textTertiary} />
              <TextInput
                value={query}
                onChangeText={(v) => {
                  setQuery(v);
                  setSelected(new Set());
                }}
                placeholder="Filter library…"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                style={styles.search}
              />
            </View>
            <View style={styles.chips}>
              <Chip
                label="Tracks"
                selected={mode === "tracks"}
                onPress={() => switchMode("tracks")}
              />
              <Chip
                label="Albums"
                selected={mode === "albums"}
                onPress={() => switchMode("albums")}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : (
            <EmptyState
              icon="musical-notes-outline"
              title="Nothing here"
              message={q ? "No matches." : "Upload or import some music."}
            />
          )
        }
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [
                styles.row,
                on && styles.rowOn,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name={on ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={on ? colors.accent : colors.textTertiary}
              />
              <Artwork
                uri={item.artworkUri}
                label={item.fallbackLabel}
                size={44}
              />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text variant="caption" numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      {selected.size ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>
          <Text variant="bodyStrong" style={styles.flex}>
            {selected.size} selected
          </Text>
          <PrimaryButton
            label="Delete"
            icon="trash-outline"
            onPress={confirmDelete}
            loading={busy}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  headerBtn: { paddingHorizontal: space.md, paddingVertical: space.sm },
  toolbar: {
    paddingHorizontal: space.lg,
    gap: space.md,
    paddingBottom: space.md,
  },
  addRow: { flexDirection: "row", gap: space.md },
  tokenInput: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.lg,
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.md,
  },
  search: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
    height: 44,
  },
  chips: { flexDirection: "row", gap: space.sm },
  row: {
    height: TRACK_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  rowOn: { backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.7 },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
