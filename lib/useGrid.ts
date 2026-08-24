import { useWindowDimensions } from 'react-native';
import { OVERSCAN, RAIL_GAP } from '../config/theme';
import { NAV_RAIL_WIDTH } from '../components/SideNav';

export interface GridMetrics {
  cellWidth: number;
  cellHeight: number;
  columns: number;
}

/**
 * Cell geometry for a fixed-column grid, measured from the live viewport.
 *
 * Android TV panels do not all report 1920x1080. A 720p box reports 1280x720,
 * and several 4K sticks report a 960dp-wide logical viewport. A grid built from
 * a hardcoded 1920 is either clipped or floating in dead space on all of them,
 * and neither is visible on the developer's own device — which is exactly the
 * class of bug that ships.
 *
 * `aspect` is width ÷ height: 16/9 for video posters, 1 for square tiles.
 */
export function useGrid(columns: number, aspect = 16 / 9): GridMetrics {
  const { width } = useWindowDimensions();

  const usable = width - NAV_RAIL_WIDTH - OVERSCAN.x * 2 - RAIL_GAP * (columns - 1);
  const cellWidth = Math.floor(usable / columns);

  return {
    columns,
    cellWidth,
    cellHeight: Math.round(cellWidth / aspect),
  };
}
