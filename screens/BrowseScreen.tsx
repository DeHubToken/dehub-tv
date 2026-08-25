import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SideNav, type NavKey } from '../components/SideNav';
import { NAV_RAIL_WIDTH } from '../config/theme';
import { HomeScreen } from './HomeScreen';
import { VideosScreen } from './VideosScreen';
import { LiveScreen } from './LiveScreen';
import { TVScreen } from './TVScreen';
import { SearchScreen } from './SearchScreen';
import { AccountScreen } from './AccountScreen';
import { colors } from '../config/theme';

/**
 * The browse shell: persistent nav on the left, one section on the right.
 *
 * Sections are a state switch rather than a navigator. React Navigation would
 * give each one its own back-stack entry, which on a remote means that after
 * browsing Videos → Live → TV the Back button walks the user backwards through
 * their own sightseeing three presses before it offers to leave. On a TV, Back
 * means "up a level", not "undo".
 *
 * So Back is defined explicitly: anywhere else goes Home, and Home hands the
 * press to the system, which is what actually exits to the launcher. Swallowing
 * it at Home instead would trap the user in the app with no way out but the
 * physical Home button.
 */
export function BrowseScreen() {
  const [section, setSection] = useState<NavKey>('home');

  const handleSelect = useCallback((key: NavKey) => setSection(key), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (section !== 'home') {
        setSection('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [section]);

  return (
    <View style={styles.root}>
      <SideNav active={section} onSelect={handleSelect} />
      <View style={styles.content}>
        {/*
          Each section is keyed and mounted fresh. Keeping all five alive would
          hold five video-thumbnail caches and five live queries in memory on a
          box with 1–2 GB of RAM, and a TV app that is killed by the system for
          memory relaunches to a cold splash screen.
        */}
        {section === 'home' && <HomeScreen key="home" />}
        {section === 'videos' && <VideosScreen key="videos" />}
        {section === 'live' && <LiveScreen key="live" />}
        {section === 'tv' && <TVScreen key="tv" />}
        {section === 'search' && <SearchScreen key="search" />}
        {section === 'account' && <AccountScreen key="account" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    // Fixed gutter for the collapsed nav rail. The expanded panel floats over
    // this rather than pushing it, so the gutter never changes width.
    marginLeft: NAV_RAIL_WIDTH,
  },
});
