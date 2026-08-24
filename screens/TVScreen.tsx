import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Grid } from '../components/Grid';
import { PillRow, type Pill } from '../components/PillRow';
import { ChannelCard } from '../components/ChannelCard';
import { Txt } from '../components/Txt';
import { Loading, ErrorState } from '../components/States';
import { getChannelsByCountry, getCountries } from '../services/liveTv.service';
import { openChannel } from '../lib/open';
import { useGrid } from '../lib/useGrid';
import { colors, spacing, OVERSCAN } from '../config/theme';
import type { RootStackParamList } from '../navigation/types';

const COLUMNS = 6;
/** Twelve rows of six. More than anyone browses in one sitting, and it keeps
 *  the country switch instant instead of rendering seven hundred tiles. */
const PER_COUNTRY_LIMIT = 72;

/**
 * Live TV.
 *
 * The country list is long — around a hundred entries over 700 channels — so
 * it is a scrolling pill row rather than a sidebar, ordered by channel count
 * so the countries that actually have something to watch come first. `All`
 * leads, which is the right default for someone who has just switched the app
 * on and does not yet know what is in it.
 */
export function TVScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [country, setCountry] = useState('all');
  const { cellWidth, cellHeight } = useGrid(COLUMNS, 1);

  const countries = useQuery({
    queryKey: ['tv', 'countries'],
    queryFn: getCountries,
    staleTime: 10 * 60 * 1000,
  });

  const channels = useQuery({
    queryKey: ['tv', 'channels', country],
    queryFn: () => getChannelsByCountry(country, PER_COUNTRY_LIMIT),
    staleTime: 10 * 60 * 1000,
  });

  const pills: Pill[] = useMemo(
    () =>
      (countries.data ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        note: String(c.count),
      })),
    [countries.data],
  );

  const activeLabel = pills.find((p) => p.id === country)?.label ?? 'All';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Txt variant="title">Live TV</Txt>
        {countries.isLoading ? (
          <Txt variant="meta" color={colors.mutedForeground}>
            Loading channel list…
          </Txt>
        ) : (
          <PillRow pills={pills} activeId={country} onSelect={setCountry} autoFocusFirst />
        )}
      </View>

      {channels.isLoading ? (
        <Loading label="Loading channels" />
      ) : channels.isError ? (
        <ErrorState
          detail={(channels.error as Error)?.message}
          onRetry={() => void channels.refetch()}
        />
      ) : (
        <Grid
          data={channels.data ?? []}
          columns={COLUMNS}
          itemWidth={cellWidth}
          itemHeight={cellHeight}
          keyExtractor={(c) => c.id}
          emptyLabel={`No channels listed for ${activeLabel}`}
          renderItem={(channel) => (
            <ChannelCard
              channel={channel}
              width={cellWidth}
              height={cellHeight}
              onPress={() => openChannel(navigation, channel)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: OVERSCAN.y,
    paddingLeft: OVERSCAN.x,
    gap: spacing.xs,
  },
});
