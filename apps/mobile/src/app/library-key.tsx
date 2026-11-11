import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { formatLibraryKey, normalizeLibraryKey, useLibrarySync, useServerBase } from '@/core';
import { Backdrop } from '@/ui/components/Backdrop';
import { EmptyState } from '@/ui/components/EmptyState';
import { confirmSwitch } from '@/ui/components/LibraryBackup';
import { OpenInApp } from '@/ui/components/OpenInApp';
import { PrimaryButton } from '@/ui/components/PrimaryButton';
import { FloatingBack } from '@/ui/components/ScreenHeader';
import { Text } from '@/ui/components/Text';
import { nav } from '@/ui/nav';
import { makeStyles, space } from '@/ui/theme';

/** Target of the library key QR code: offers to use that library on this device. */
export default function LibraryKeyScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ k?: string }>();
  const raw = Array.isArray(params.k) ? params.k[0] : params.k;
  const key = raw ? normalizeLibraryKey(raw) : null;
  const current = useLibrarySync().key;
  const hasServer = !!useServerBase();
  const done = () => router.replace('/library');

  return (
    <View style={styles.root}>
      <Backdrop />
      <View style={styles.center}>
        {!key ? (
          <EmptyState icon="key-outline" title="Not a library key" message="This link doesn’t contain a valid library key." />
        ) : !hasServer ? (
          <EmptyState icon="server-outline" title="Not connected to a server" message="Connect to the same server in Settings, then open this link again.">
            <PrimaryButton label="Open settings" variant="surface" onPress={nav.settings} />
          </EmptyState>
        ) : key === current ? (
          <EmptyState icon="checkmark-circle" title="Already using this library" message="This device already backs up to this key.">
            <PrimaryButton label="Open library" variant="surface" onPress={done} />
          </EmptyState>
        ) : (
          <EmptyState
            icon="key-outline"
            title="Use this library here?"
            message="Its playlists and likes will appear on this device. What is here now is kept and added to it.">
            <Text variant="mono" style={styles.key}>
              {formatLibraryKey(key)}
            </Text>
            <PrimaryButton label="Use this library" icon="checkmark" onPress={() => confirmSwitch(key, done)} />
          </EmptyState>
        )}
      </View>
      <FloatingBack />
      {raw ? <OpenInApp path={`/library-key?k=${encodeURIComponent(raw)}`} /> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  key: { textAlign: 'center', marginBottom: space.md },
}));
