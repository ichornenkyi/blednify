import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CoreProvider } from '@/core';
import { ActionSheetHost } from '@/ui/components/ActionSheet';
import { ToastHost } from '@/ui/components/Toast';
import { makeStyles, navigationThemeFor, useColors } from '@/ui/theme';

export default function RootLayout() {
  const styles = useStyles();
  const colors = useColors();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);
  return (
    <GestureHandlerRootView style={styles.root}>
      <CoreProvider>
        <ThemeProvider value={navigationThemeFor(colors)}>
          <StatusBar style={colors.isLight ? 'dark' : 'light'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: styles.content, animation: 'ios_from_right' }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="player"
              options={{
                presentation: 'transparentModal',
                animation: 'slide_from_bottom',
                gestureEnabled: false,
                contentStyle: styles.transparent,
              }}
            />
            <Stack.Screen name="queue" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="lyrics" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          </Stack>
          <ActionSheetHost />
          <ToastHost />
        </ThemeProvider>
      </CoreProvider>
    </GestureHandlerRootView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { backgroundColor: colors.bg },
  transparent: { backgroundColor: 'transparent' },
}));
