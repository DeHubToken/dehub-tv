import React from 'react';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BrowseScreen } from '../screens/BrowseScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { CreatorScreen } from '../screens/CreatorScreen';
import { colors } from '../config/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.foreground,
    border: colors.border,
    primary: colors.foreground,
  },
};

/**
 * Two screens, deliberately.
 *
 * Browse is one shell that switches sections internally; the player is a real
 * push so that Back from playback lands exactly where the user left, with focus
 * restored to the tile they came from. That focus restoration is the whole
 * reason the player is a separate route rather than a modal overlay — a TV user
 * who backs out of a two-hour film to find the focus ring at the top-left of
 * the home screen has lost their place entirely.
 */
export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // There is no edge-swipe on a remote, and the default slide costs a
          // frame drop on the low-powered chips these boxes ship with.
          animation: 'fade',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Browse" component={BrowseScreen} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{ contentStyle: { backgroundColor: '#000' } }}
        />
        <Stack.Screen name="Creator" component={CreatorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
