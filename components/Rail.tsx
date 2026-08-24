import React, { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { TVFocusGuideView } from '../lib/tv';
import { colors, spacing, OVERSCAN, RAIL_GAP, FOCUS_SCALE, STAGE_INSET, s } from '../config/theme';

export interface RailRenderApi {
  /** Call from the item's own `onFocus`. Scrolls the row to keep it visible. */
  focusIndex: (index: number) => void;
  /** True for the one item that should hold focus when the screen mounts. */
  autoFocus: boolean;
}

export interface RailProps<T> {
  title: string;
  /** Optional right-hand note — a count, a country, "12 live now". */
  subtitle?: string;
  data: T[];
  itemWidth: number;
  itemHeight: number;
  renderItem: (item: T, index: number, api: RailRenderApi) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  /** Put initial screen focus on this rail's first tile. One rail per screen. */
  autoFocusFirst?: boolean;
  gap?: number;
}

/**
 * A horizontal row of tiles.
 *
 * Two things make this different from a phone carousel, and both are about the
 * fact that nobody can drag it:
 *
 * **The row scrolls itself.** Focus moves one tile at a time and the row has to
 * follow, so scroll position is derived from the focused index rather than from
 * a gesture. The focused tile is parked one gap in from the left edge instead of
 * centred — centring means the very first tile of a rail jumps inward the moment
 * it takes focus, which reads as the row lurching when the user has not moved.
 *
 * **Nothing may clip.** A focused tile grows past its own bounds, and Android
 * ignores `overflow: visible` on a scroll container, so the row reserves the
 * growth as real padding. Without it the focus ring is sliced off at the top and
 * bottom of every rail — the single most common way a TV grid looks broken.
 */
export function Rail<T>({
  title,
  subtitle,
  data,
  itemWidth,
  itemHeight,
  renderItem,
  keyExtractor,
  autoFocusFirst,
  gap = RAIL_GAP,
}: RailProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const step = itemWidth + gap;

  const focusIndex = useCallback(
    (index: number) => {
      // One step of lead-in, so the tile before the focused one stays partly
      // visible. A row that scrolls the focused tile flush to the edge gives no
      // hint that there is anything behind it.
      const x = Math.max(0, index * step - gap);
      scrollRef.current?.scrollTo({ x, animated: true });
    },
    [gap, step],
  );

  if (!data.length) return null;

  // Reserve the focus growth on all four sides so nothing is clipped.
  const overflowY = Math.ceil((itemHeight * (FOCUS_SCALE - 1)) / 2) + s(5);
  const overflowX = Math.ceil((itemWidth * (FOCUS_SCALE - 1)) / 2) + s(5);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Txt variant="rail">{title}</Txt>
        {!!subtitle && (
          <Txt variant="meta" color={colors.mutedForeground} style={styles.subtitle}>
            {subtitle}
          </Txt>
        )}
      </View>

      <TVFocusGuideView autoFocus trapFocusLeft={false} trapFocusRight={false}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Scrolling stays ENABLED even though nothing here is draggable.
          // Android's own focus handling scrolls a container to reveal a newly
          // focused descendant, and `scrollEnabled={false}` switches that off
          // along with touch — which would leave a rail that never moves if the
          // manual `scrollTo` below ever failed to fire. Keeping both means the
          // row still tracks focus if either one does; they animate to nearly
          // the same offset, so there is nothing to see when both run.
          contentContainerStyle={[
            styles.content,
            {
              paddingLeft: STAGE_INSET,
              paddingRight: STAGE_INSET + overflowX,
              paddingVertical: overflowY,
              gap,
            },
          ]}
        >
          {data.map((item, index) => (
            <View key={keyExtractor(item, index)} style={{ width: itemWidth }}>
              {renderItem(item, index, {
                focusIndex,
                autoFocus: !!autoFocusFirst && index === 0,
              })}
            </View>
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    paddingHorizontal: STAGE_INSET,
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: s(2),
  },
  content: {
    alignItems: 'flex-start',
  },
});
