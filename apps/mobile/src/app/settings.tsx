import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  discardImport,
  formatBytes,
  isImportLink,
  searchImports,
  startImport,
  supportsOffline,
  testServer,
  useDownloads,
  useImportIndexers,
  useImports,
  useServerStatus,
  useSettings,
  type ImportJob,
  type ImportResults,
  type ImportTarget,
} from '@/core';
import { attempt, errorMessage, importMusic } from '@/ui/actions';
import { BrandMark } from '@/ui/components/BrandMark';
import { Chip } from '@/ui/components/Chip';
import { Icon, type IconName } from '@/ui/components/Icon';
import { ListRow } from '@/ui/components/ListRow';
import { PrimaryButton } from '@/ui/components/PrimaryButton';
import { ScreenHeader } from '@/ui/components/ScreenHeader';
import { Text } from '@/ui/components/Text';
import { plural } from '@/ui/format';
import { haptics } from '@/ui/haptics';
import { nav } from '@/ui/nav';
import { showToast } from '@/ui/overlay';
import { colors, radius, space } from '@/ui/theme';

type TestResult = { ok: boolean; message: string } | null;

/** Trim, add a scheme when missing, drop trailing slashes. Empty stays empty (offline mode). */
function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`;
  return withScheme.replace(/\/+$/, '');
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const status = useServerStatus();
  const { bytesUsed, completedCount } = useDownloads();
  const [url, setUrl] = useState(settings.serverUrl);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  const normalized = normalizeUrl(url);
  const dirty = normalized !== settings.serverUrl;

  const runTest = async () => {
    if (!normalized) return;
    setTesting(true);
    setResult(null);
    try {
      const r = await testServer(normalized);
      setResult(
        r.ok
          ? { ok: true, message: `Connected · ${plural(r.trackCount ?? 0, 'track')}` }
          : { ok: false, message: r.error ?? 'Could not reach server' },
      );
      if (r.ok) haptics.success();
      else haptics.warn();
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e) });
      haptics.warn();
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    settings.setServerUrl(normalized);
    setUrl(normalized);
    showToast(normalized ? 'Server saved' : 'Server removed — offline mode', 'success');
  };

  const version = Constants.expoConfig?.version ?? '—';

  return (
    <View style={styles.root}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <Section title="Server" icon="server-outline">
          <Text variant="caption">
            Address of your self-hosted Blednify server.{supportsOffline ? ' Leave empty to use only music on this phone.' : ''}
          </Text>
          <TextInput
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setResult(null);
            }}
            placeholder="http://192.168.1.10:8787"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            returnKeyType="done"
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            onSubmitEditing={runTest}
            style={styles.input}
          />
          {result ? (
            <View style={styles.result}>
              <Icon name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={result.ok ? colors.success : colors.danger} />
              <Text variant="caption" color={result.ok ? colors.success : colors.danger} style={styles.flex}>
                {result.message}
              </Text>
            </View>
          ) : !dirty && settings.serverUrl ? (
            <View style={styles.result}>
              <View
                style={[styles.dot, { backgroundColor: status.online ? colors.success : status.isLoading ? colors.textTertiary : colors.danger }]}
              />
              <Text variant="caption" style={styles.flex}>
                {status.isLoading ? 'Checking…' : status.online ? `Online · ${plural(status.trackCount, 'track')}` : 'Offline'}
              </Text>
            </View>
          ) : null}
          <View style={styles.buttons}>
            <PrimaryButton
              label="Test"
              icon="pulse"
              variant="surface"
              onPress={runTest}
              loading={testing}
              disabled={!normalized}
              style={styles.flex}
            />
            <PrimaryButton label="Save" icon="checkmark" onPress={save} disabled={!dirty} style={styles.flex} />
          </View>
        </Section>

        <AddMusicSection />

        {supportsOffline ? (
          <>
            <Section title="Downloads" icon="arrow-down-circle-outline">
              <View style={styles.toggleRow}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">Download on Wi-Fi only</Text>
                  <Text variant="caption">Pause downloads on mobile data.</Text>
                </View>
                <Switch
                  value={settings.downloadOnWifiOnly}
                  onValueChange={(v) => {
                    haptics.select();
                    settings.setDownloadOnWifiOnly(v);
                  }}
                  trackColor={{ false: colors.surface3, true: colors.accent }}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.surface3}
                />
              </View>
            </Section>

            <View style={styles.card}>
              <ListRow
                leading={<RowIcon name="folder-outline" />}
                title="Storage used"
                subtitle={`${formatBytes(bytesUsed)} · ${plural(completedCount, 'download')}`}
                chevron
                onPress={nav.downloads}
              />
              <ListRow
                leading={<RowIcon name="add-circle-outline" />}
                title="Import music"
                subtitle="Add audio files from this phone"
                chevron
                onPress={importMusic}
              />
            </View>
          </>
        ) : null}

        <View style={styles.about}>
          <BrandMark size={64} />
          <Text variant="subheading">Blednify</Text>
          <Text variant="caption">Version {version}</Text>
          <Text variant="caption" style={styles.centerText}>
            No ads. No tracking. No accounts.{'\n'}Your music stays on your server and your phone.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function AddMusicSection() {
  const { enabled, jobs } = useImports();
  const { adminToken, setAdminToken } = useSettings();
  const indexers = useImportIndexers(enabled);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const indexer = indexers.some((i) => i.id === picked) ? picked : null;
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);

  if (!enabled) return null;

  const isLink = isImportLink(input);

  const add = async (target: ImportTarget) => {
    setBusy(true);
    const job = await attempt(startImport(target, indexer));
    setBusy(false);
    if (!job) return;
    setInput('');
    setResults(null);
  };

  const submit = async () => {
    const text = input.trim();
    if (!text) return;
    if (isLink) return add({ url: text });
    setBusy(true);
    const found = await attempt(searchImports(text));
    setBusy(false);
    if (found) setResults(found);
  };

  return (
    <Section title="Add music" icon="cloud-download-outline">
      <Text variant="caption">
        Search for a song or album and pick the right one, or paste a public or unlisted YouTube Music playlist link. The server finds each song
        through Jackett, downloads it with TorrServer and adds it to your library. Songs without a good match are listed as failed. Auto picks
        trackers by language.
      </Text>
      <TextInput
        value={input}
        onChangeText={(text) => {
          setInput(text);
          setResults(null);
        }}
        onSubmitEditing={() => void submit()}
        returnKeyType="search"
        placeholder="Song, album or playlist link"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={styles.input}
      />
      {indexers.length > 0 ? (
        <View style={styles.chips}>
          <Chip label="Auto" selected={indexer === null} onPress={() => setPicked(null)} />
          {indexers.map((i) => (
            <Chip key={i.id} label={i.name} selected={indexer === i.id} onPress={() => setPicked(i.id)} />
          ))}
        </View>
      ) : null}
      <TextInput
        value={adminToken}
        onChangeText={setAdminToken}
        placeholder="Server admin token"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={styles.input}
      />
      <PrimaryButton
        label={isLink ? 'Add' : 'Search'}
        icon={isLink ? 'arrow-down' : 'search'}
        onPress={() => void submit()}
        loading={busy}
        disabled={!input.trim()}
      />
      {results ? <ImportResultList results={results} onPick={(target) => void add(target)} /> : null}
      {jobs.map((job) => (
        <ImportJobRow key={job.id} job={job} />
      ))}
    </Section>
  );
}

function ImportResultList({ results, onPick }: { results: ImportResults; onPick: (target: ImportTarget) => void }) {
  const addIcon = <Icon name="arrow-down" size={18} color={colors.textTertiary} />;
  if (results.albums.length === 0 && results.songs.length === 0) return <Text variant="caption">Nothing found on YouTube Music.</Text>;
  return (
    <View>
      {results.albums.length > 0 ? <Text variant="micro">ALBUMS</Text> : null}
      {results.albums.map((a) => (
        <ListRow
          key={a.id}
          title={a.title}
          subtitle={[a.type, a.artists.join(', '), a.year].filter(Boolean).join(' · ')}
          trailing={addIcon}
          onPress={() => onPick({ albumId: a.id })}
        />
      ))}
      {results.songs.length > 0 ? <Text variant="micro">SONGS</Text> : null}
      {results.songs.map((s) => (
        <ListRow
          key={s.videoId}
          title={s.title}
          subtitle={[s.artists.join(', '), s.album, s.durationMs === null ? null : clock(s.durationMs)].filter(Boolean).join(' · ')}
          trailing={addIcon}
          onPress={() => onPick({ song: s })}
        />
      ))}
    </View>
  );
}

const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const MAX_FAILURES_SHOWN = 5;

function ImportJobRow({ job }: { job: ImportJob }) {
  const added = job.tracks.filter((t) => t.status === 'done').length;
  const existing = job.tracks.filter((t) => t.status === 'exists').length;
  const failed = job.tracks.filter((t) => t.status === 'failed');
  const current = job.tracks.find((t) => t.status === 'searching' || t.status === 'downloading');
  const active = job.status === 'queued' || job.status === 'running';
  const songResult = added ? 'Added' : existing ? 'Already in library' : failed.length ? 'Failed' : 'Cancelled';
  const playlistSummary = [
    active ? `${added + existing + failed.length} of ${job.tracks.length}` : `${job.tracks.length} in ${job.kind}`,
    `${added} added`,
    existing ? `${existing} already in library` : null,
    failed.length ? `${failed.length} failed` : null,
    job.status === 'cancelled' ? 'cancelled' : null,
  ].filter(Boolean);
  const status = job.kind === 'song' ? (active ? 'In progress' : songResult) : playlistSummary.join(' · ');
  const summary = job.indexer ? `${status} · ${job.indexer}` : status;

  return (
    <View style={styles.job}>
      <Text variant="bodyStrong" numberOfLines={1}>
        {job.title}
      </Text>
      <Text variant="caption">{summary}</Text>
      {current ? (
        <Text variant="caption" numberOfLines={1}>
          {current.status === 'downloading' ? 'Downloading' : 'Searching for'} {current.title}
        </Text>
      ) : null}
      {failed.slice(0, MAX_FAILURES_SHOWN).map((t) => (
        <Text key={t.videoId} variant="caption" color={colors.danger} numberOfLines={2}>
          {t.artists.join(', ')} – {t.title}: {t.error}
        </Text>
      ))}
      {failed.length > MAX_FAILURES_SHOWN ? <Text variant="caption">and {failed.length - MAX_FAILURES_SHOWN} more failed</Text> : null}
      <PrimaryButton
        label={active ? 'Cancel' : 'Dismiss'}
        icon="close"
        variant="surface"
        onPress={() => void attempt(discardImport(job.id))}
      />
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={18} color={colors.accent} />
        <Text variant="micro">{title.toUpperCase()}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function RowIcon({ name }: { name: IconName }) {
  return (
    <View style={styles.rowIcon}>
      <Icon name={name} size={20} color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg },
  sectionBody: { padding: space.lg, gap: space.md },
  input: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.lg,
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  buttons: { flexDirection: 'row', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  job: { gap: space.xs, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  about: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  centerText: { textAlign: 'center', marginTop: space.sm },
});
