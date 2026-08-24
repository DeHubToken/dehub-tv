import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { colors, spacing, OVERSCAN, RAIL_GAP, FOCUS_SCALE, STAGE_INSET, s } from '../config/theme';

export interface GridProps<T> {
  data: T[];
  itemWidth: number;
  itemHeight: number;
  columns: number;
  renderItem: (item: T, index: number, autoFocus: boolean) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  onEndReached?: () => void;
  emptyLabel?: string;
}

/**
 * A paged, focusable grid — the browse-everything counterpart to `Rail`.
 *
 * `removeClippedSubviews` is off and the render window is deliberately wide.
 * FlatList's default windowing unmounts rows that scroll out of view, and
 * unmounting the currently focused view hands focus back to the root: from the
 * user's side, the ring vanishes and the next D-pad press starts from the top
 * of the screen. On a phone that never happens because there is no focus to
 * lose. It is the single most confusing failure mode in a TV grid, and it costs
 * a few megabytes of retained views to avoid.
 */
export function Grid<T>({
  data,
  itemWidth,
  itemHeight,
  columns,
  renderItem,
  keyExtractor,
  header,
  footer,
  onEndReached,
  emptyLabel = 'Nothing here yet',
}: GridProps<T>) {
  const overflow = Math.ceil((itemHeight * (FOCUS_SCALE - 1)) / 2) + s(5);

  return (
    <FlatList
      data={data}
      key={`cols-${columns}`}
      numColumns={columns}
      keyExtractor={keyExtractor}
      renderItem={({ item, index }) => (
        <View style={{ width: itemWidth, marginBottom: RAIL_GAP + overflow }}>
          {renderItem(item, index, index === 0)}
        </View>
      )}
      columnWrapperStyle={columns > 1 ? styles.column : undefined}
      contentContainerStyle={[
        styles.content,
        { paddingTop: overflow, paddingBottom: OVERSCAN.y + spacing.xxl },
      ]}
      ListHeaderComponent={header ? <>{header}</> : null}
      ListFooterComponent={footer ? <>{footer}</> : null}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Txt variant="body" color={colors.mutedForeground}>
            {emptyLabel}
          </Txt>
        </View>
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      removeClippedSubviews={false}
      initialNumToRender={columns * 4}
      windowSize={11}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: STAGE_INSET,
  },
  column: {
    gap: RAIL_GAP,
  },
  empty: {
    paddingVertical: spacing.xxl * 2,
    alignItems: 'center',
  },
});
