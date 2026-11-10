import { Platform, Share, View } from 'react-native';

import { shareUrl, type ShareTarget } from '@/core';

import { haptics } from '../haptics';
import { closeSheet, showSheet, showToast, type SheetAnchor } from '../overlay';
import { makeStyles, radius, space, useColors } from '../theme';
import { SheetHeader } from './ActionSheet';
import { PrimaryButton } from './PrimaryButton';
import { QR_MAX_LENGTH, QrCode } from './QrCode';
import { Text } from './Text';

type ShareSheetProps = {
  target: ShareTarget;
  title: string;
  subtitle?: string;
  artworkUri?: string | null;
};

/** Link + QR code for something on the server. Opens a sheet, or explains why there is nothing to share. */
export function openShare(props: ShareSheetProps, opts: { anchor?: SheetAnchor } = {}) {
  if (!shareUrl(props.target)) {
    showToast('Connect to a server to share', 'error');
    return;
  }
  showSheet(<ShareSheet {...props} />, opts);
}

const canWebShare = Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

function ShareSheet({ target, title, subtitle, artworkUri }: ShareSheetProps) {
  const styles = useStyles();
  const colors = useColors();
  const url = shareUrl(target);
  if (!url) return null;
  const qrFits = url.length <= QR_MAX_LENGTH;

  const share = async () => {
    haptics.tap();
    try {
      if (Platform.OS === 'web') {
        if (canWebShare) await navigator.share({ title, url });
        else await copy();
        return;
      }
      // Android reads `message`, iOS prefers `url`; give both the link only so apps don't paste it twice.
      await Share.share(Platform.OS === 'ios' ? { url } : { message: url, title });
    } catch {
      // Dismissed share sheets reject on web; nothing to report.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      haptics.success();
      showToast('Link copied', 'success');
      closeSheet();
    } catch {
      showToast('Could not copy the link', 'error');
    }
  };

  return (
    <View style={styles.root}>
      <SheetHeader title={title} subtitle={subtitle} artworkUri={artworkUri} artworkLabel={title} />
      <View style={styles.body}>
        {qrFits ? (
          <View style={styles.qrFrame}>
            <QrCode value={url} size={QR_SIZE} />
          </View>
        ) : (
          <Text variant="caption" style={styles.center}>
            Too many songs for a QR code. Share the link instead.
          </Text>
        )}
        <Text variant="caption" color={colors.textSecondary} style={styles.center}>
          {qrFits ? 'Scan with a phone camera. ' : ''}Works for anyone who uses this server.
        </Text>
        <Text variant="mono" numberOfLines={2} selectable style={styles.url}>
          {url}
        </Text>
        <View style={styles.buttons}>
          <PrimaryButton label="Share link" icon="share-outline" onPress={() => void share()} style={styles.flex} />
          {Platform.OS === 'web' ? (
            <PrimaryButton label="Copy" icon="copy-outline" variant="surface" onPress={() => void copy()} style={styles.flex} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const QR_SIZE = 232;

const useStyles = makeStyles(() => ({
  root: { paddingBottom: space.lg },
  body: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md, alignItems: 'center' },
  qrFrame: { padding: space.sm, borderRadius: radius.lg, backgroundColor: '#FFFFFF' },
  center: { textAlign: 'center' },
  url: { textAlign: 'center', alignSelf: 'stretch' },
  buttons: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  flex: { flex: 1 },
}));
