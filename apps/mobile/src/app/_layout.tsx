import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CoreProvider } from '@/core';
import { ActionSheetHost } from '@/ui/components/ActionSheet';
import { ToastHost } from '@/ui/components/Toast';
import { colors, navigationTheme } from '@/ui/theme';

const CONTENT = { backgroundColor: colors.bg };

/** expo-router's own provider reports zero insets on web, which would put screens under the iPhone's system UI. */
const SafeArea = Platform.OS === 'web' ? SafeAreaProvider : Fragment;

export default function RootLayout() {
  return (
    <SafeArea>
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
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  transparent: { backgroundColor: 'transparent' },
});
