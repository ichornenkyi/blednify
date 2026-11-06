import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  discardImport,
  isImportLink,
  searchImports,
  startImport,
  useImports,
  type ImportJob,
  type ImportResults,
  type ImportTarget,
} from '@/core';

import { attempt } from '../actions';
import { colors, radius, space } from '../theme';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
import { PrimaryButton } from './PrimaryButton';
import { Section } from './Section';
import { Text } from './Text';

export function AddMusicSection() {
  const { enabled, jobs } = useImports();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);

  if (!enabled) return null;

  const isLink = isImportLink(input);

  const add = async (target: ImportTarget) => {
    setBusy(true);
    const job = await attempt(startImport(target));
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
        Search for a song or album and pick the right one, or paste a public or unlisted YouTube Music playlist link. The server downloads each
        song from YouTube Music and adds it to your library. Songs it cannot download are listed as failed.
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
  const current = job.tracks.find((t) => t.status === 'downloading');
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

  return (
    <View style={styles.job}>
      <Text variant="bodyStrong" numberOfLines={1}>
        {job.title}
      </Text>
      <Text variant="caption">{status}</Text>
      {current ? (
        <Text variant="caption" numberOfLines={1}>
          Downloading {current.title}
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

const styles = StyleSheet.create({
  input: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.lg,
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  job: { gap: space.xs, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
