import React, { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Focusable } from './Focusable';
import { Txt } from './Txt';
import { colors, radius, spacing, STAGE_INSET, s } from '../config/theme';

export interface Pill {
  id: string;
  label: string;
  /** Shown after the label in dimmer type — a count, usually. */
  note?: string;
}

export interface PillRowProps {
  pills: Pill[];
  activeId: string;
  onSelect: (id: string) => void;
  autoFocusFirst?: boolean;
  /** Row is laid out edge-to-edge; set false when already inside a padded box. */
  inset?: boolean;
}

/**
 * A horizontal row of filter chips.
 *
 * Selection is on PRESS, never on focus. Filtering as the ring passes over a
 * chip is a tempting shortcut — it saves a click — and it is wrong on a TV:
 * moving right through eight countries would fire eight queries and repaint the
 * grid underneath eight times, and the user cannot get to the chip they wanted
 * without passing through all of them.
 */
export function PillRow({ pills, activeId, onSelect, autoFocusFirst, inset = true }: PillRowProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);

  const focusIndex = useCallback((index: number) => {
    const x = Math.max(0, (offsets.current[index] ?? 0) - spacing.xxl);
    scrollRef.current?.scrollTo({ x, animated: true });
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Left enabled for the same reason as `Rail` — disabling it also disables
      // Android's scroll-to-focused-descendant.
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: inset ? STAGE_INSET : 0 },
      ]}
    >
      {pills.map((pill, index) => {
        const isActive = pill.id === activeId;
        return (
          <View
            key={pill.id}
            onLayout={(e) => {
              offsets.current[index] = e.nativeEvent.layout.x;
            }}
          >
            <Focusable
              onPress={() => onSelect(pill.id)}
              onFocus={() => focusIndex(index)}
              autoFocus={autoFocusFirst && index === 0}
              scaleOnFocus={false}
              ring={false}
              borderRadius={radius.pill}
            >
              {(focused) => (
                <View
                  style={[
                    styles.pill,
                    isActive && styles.pillActive,
                    focused && styles.pillFocused,
                  ]}
                >
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
                    {pill.label}
                  </Txt>
                  {!!pill.note && (
                    <Txt
                      variant="meta"
                      color={focused ? colors.controlFocusedForeground : colors.dimForeground}
                    >
                      {pill.note}
                    </Txt>
                  )}
                </View>
              )}
            </Focusable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + s(2),
    borderRadius: radius.pill,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillActive: {
    // Selected state is a white edge and white text, per the house system —
    // never a fill colour.
    borderColor: colors.borderFocused,
  },
  pillFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
});
