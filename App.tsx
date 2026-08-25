import React, { useCallback, useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import {
  useFonts,
  Exo_400Regular,
  Exo_500Medium,
  Exo_600SemiBold,
  Exo_700Bold,
} from '@expo-google-fonts/exo';
import { RootNavigator } from './navigation/RootNavigator';
import { AuthProvider } from './contexts/AuthContext';
import { queryClient } from './config/queryClient';
import { colors } from './config/theme';

void SplashScreen.preventAutoHideAsync();

/**
 * Exo is the DeHub typeface and the app does not render before it has loaded.
 *
 * On a phone a font swap is a flicker. On a TV it re-flows every rail's title
 * and every card's two-line clamp at once, half a second after the user is
 * already looking at the screen — so the splash is held until the fonts are in
 * rather than shipping that.
 */
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Exo_400Regular,
    Exo_500Medium,
    Exo_600SemiBold,
    Exo_700Bold,
  });

  useEffect(() => {
    // Paints the window background before the first React frame. Without it the
    // gap between splash and first render is the platform's default white, and
    // a white flash on a dark app in a dark room is genuinely unpleasant.
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

  const onReady = useCallback(() => {
    // A font error is not fatal — the system face is ugly, not broken — so the
    // splash is dismissed either way rather than leaving a permanent splash on
    // a device where Google Fonts is unreachable.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <View style={styles.root}>
            <StatusBar hidden />
            <RootNavigator />
          </View>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
