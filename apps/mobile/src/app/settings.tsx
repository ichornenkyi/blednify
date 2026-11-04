import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatBytes, testServer, useDownloads, useServerStatus, useSettings } from '@/core';
import { errorMessage, importMusic } from '@/ui/actions';
import { BrandMark } from '@/ui/components/BrandMark';
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
          <Text variant="caption">Address of your self-hosted Blednify server. Leave empty to use only music on this phone.</Text>
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  about: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  centerText: { textAlign: 'center', marginTop: space.sm },
});
