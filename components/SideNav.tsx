import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Focusable } from './Focusable';
import { Txt } from './Txt';
import { TVFocusGuideView } from '../lib/tv';
import { colors, radius, spacing, OVERSCAN, s } from '../config/theme';

export type NavKey = 'home' | 'videos' | 'live' | 'tv' | 'search';

export interface NavItem {
  key: NavKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'videos', label: 'Videos', icon: 'film' },
  { key: 'live', label: 'Live', icon: 'radio' },
  { key: 'tv', label: 'Live TV', icon: 'tv' },
  { key: 'search', label: 'Search', icon: 'search' },
];

/** Always-visible icon rail. Content is laid out to the right of this. */
export const NAV_RAIL_WIDTH = s(96);
const NAV_EXPANDED_WIDTH = s(240);

export interface SideNavProps {
  active: NavKey;
  onSelect: (key: NavKey) => void;
}

/**
 * Left navigation.
 *
 * It expands as an OVERLAY rather than by taking layout width. Expanding in
 * flow would re-flow every rail to the right of it the instant focus enters the
 * nav, which on a TV means the thing the user was looking at slides sideways
 * because they pressed LEFT — the opposite of what pressing LEFT should do.
 * Content keeps a fixed `NAV_RAIL_WIDTH` gutter and the expanded panel floats
 * over it, dimming what it covers.
 *
 * The active item stays marked while focus is elsewhere. Focus is a cursor, not
 * a selection, and a nav that only shows where you *are* when you happen to be
 * standing in it tells you nothing while you are browsing.
 */
export function SideNav({ active, onSelect }: SideNavProps) {
  const [expanded, setExpanded] = useState(false);
  const width = useRef(new Animated.Value(NAV_RAIL_WIDTH)).current;

  const animate = useCallback(
    (to: number) => {
      Animated.timing(width, {
        toValue: to,
        duration: 160,
        // Width cannot run on the native driver; the panel is small and this is
        // the only layout animation in the app.
        useNativeDriver: false,
      }).start();
    },
    [width],
  );

  const open = useCallback(() => {
    setExpanded(true);
    animate(NAV_EXPANDED_WIDTH);
  }, [animate]);

  const close = useCallback(() => {
    setExpanded(false);
    animate(NAV_RAIL_WIDTH);
  }, [animate]);

  return (
    <Animated.View style={[styles.wrapper, { width }]} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(1,3,5,0.98)', 'rgba(1,3,5,0.92)', 'rgba(1,3,5,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <TVFocusGuideView autoFocus style={styles.list}>
        <View style={styles.brand}>
          <Txt variant="rail" color={colors.foreground}>
            {expanded ? 'DeHub TV' : 'D'}
          </Txt>
        </View>

        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Focusable
              key={item.key}
              onPress={() => onSelect(item.key)}
              onFocus={open}
              onBlur={close}
              scaleOnFocus={false}
              ring={false}
              borderRadius={radius.pill}
            >
              {(focused) => (
                <View style={[styles.item, isActive && styles.itemActive, focused && styles.itemFocused]}>
                  <Ionicons
                    name={item.icon}
                    size={s(24)}
                    color={
                      focused
                        ? colors.controlFocusedForeground
                        : isActive
                          ? colors.foreground
                          : colors.mutedForeground
                    }
                  />
                  {expanded && (
                    <Txt
                      variant="card"
                      numberOfLines={1}
                      color={
                        focused
                          ? colors.controlFocusedForeground
                          : isActive
                            ? colors.foreground
                            : colors.mutedForeground
                      }
                    >
                      {item.label}
                    </Txt>
                  )}
                  {/* Active state is a white edge, per the house system — and
                      unlike the thin left bar it replaces, a border around the
                      whole pill has nothing an overscanning panel can crop off
                      and leave meaningless. */}
                </View>
              )}
            </Focusable>
          );
        })}
      </TVFocusGuideView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
  },
  list: {
    flex: 1,
    justifyContent: 'center',
    // 34 + the item's own 14 puts the icon's left edge on the 48dp safe line.
    paddingLeft: s(34),
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  brand: {
    height: s(52),
    justifyContent: 'center',
    // No extra inset — the wordmark's left edge lines up with the icons below it.
    marginBottom: spacing.xl,
    position: 'absolute',
    top: OVERSCAN.y,
    left: OVERSCAN.x,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: s(52),
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    // Reserved so the active border does not resize the row when it appears.
    borderWidth: s(2),
    borderColor: 'transparent',
  },
  itemActive: {
    borderWidth: s(2),
    borderColor: colors.borderFocused,
  },
  itemFocused: {
    backgroundColor: colors.controlFocused,
    borderWidth: s(2),
    borderColor: colors.borderFocused,
  },
});
