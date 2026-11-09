import { ActivityIndicator, View } from 'react-native';

import { makeStyles, useColors } from '../theme';

export function Loading() {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
}));
