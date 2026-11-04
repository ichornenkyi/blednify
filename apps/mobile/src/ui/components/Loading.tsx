import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

export function Loading() {
  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
