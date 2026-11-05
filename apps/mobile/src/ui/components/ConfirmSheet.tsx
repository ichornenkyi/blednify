import { StyleSheet, View } from 'react-native';

import { haptics } from '../haptics';
import { closeSheet, showSheet } from '../overlay';
import { colors, space } from '../theme';
import { PrimaryButton } from './PrimaryButton';
import { Text } from './Text';

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/** In-app replacement for `Alert.alert` confirmations, styled like the rest of the app's sheets. */
export function confirm(opts: ConfirmOptions) {
  if (opts.destructive) haptics.warn();
  showSheet(<ConfirmSheet {...opts} />);
}

function ConfirmSheet({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm }: ConfirmOptions) {
  return (
    <View style={styles.root} accessibilityRole="alert">
      <View style={styles.copy}>
        <Text variant="heading">{title}</Text>
        {message ? <Text variant="body" color={colors.textSecondary}>{message}</Text> : null}
      </View>
      <View style={styles.buttons}>
        <PrimaryButton label={cancelLabel} variant="surface" onPress={closeSheet} style={styles.flex} />
        <PrimaryButton
          label={confirmLabel}
          variant={destructive ? 'danger' : 'accent'}
          onPress={() => {
            closeSheet();
            onConfirm();
          }}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.xl },
  copy: { gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
});
