import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CoreProvider } from '@/core';
import { ActionSheetHost } from '@/ui/components/ActionSheet';
import { ToastHost } from '@/ui/components/Toast';
import { colors, navigationTheme } from '@/ui/theme';

const CONTENT = { backgroundColor: colors.bg };

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <CoreProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: CONTENT, animation: 'ios_from_right' }}>
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
          </Stack>
          <ActionSheetHost />
          <ToastHost />
        </ThemeProvider>
      </CoreProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  transparent: { backgroundColor: 'transparent' },
});
