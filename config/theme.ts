import { Dimensions } from 'react-native';

/**
 * DeHub TV design tokens
 * ======================
 * The palette is the house monochrome system — black / white / zinc, no
 * coloured accents, hue reserved strictly for semantic state (live, error).
 * It is copied from the phone app's `theme/colors.ts` rather than re-derived,
 * so the two clients cannot drift.
 *
 * The SIZING is not copied, and must not be. A phone is held at 30 cm and a TV
 * is watched from three metres, so every dimension here is a 10-foot dimension:
 * body copy starts around 17sp, touch targets become focus targets, and nothing
 * relies on a gesture.
 */

// ── The reference viewport, and why nothing here is a raw pixel ─────────────
//
// A 1080p Android TV does NOT report a 1920-wide layout. Almost all of them ship
// at xhdpi (density 2.0), so React Native sees a **960 x 540 dp** window — and a
// 720p box, a 4K stick and a tablet-derived Fire TV build all report something
// different again. A layout written against 1920 is either twice the size it
// should be or floating in dead space, and on the developer's own device it
// looks fine, which is how it ships.
//
// So every dimension below is authored against a 960 dp reference and scaled by
// the real window width at module load. A TV never rotates and never resizes,
// so reading `Dimensions` once is safe and keeps all of this in static
// `StyleSheet` values rather than forcing a hook into every component.
const REFERENCE_WIDTH = 960;
const windowWidth = Dimensions.get('window').width || REFERENCE_WIDTH;

/** Scale factor from the 960 dp reference to this panel. */
export const SCALE = windowWidth / REFERENCE_WIDTH;

/** Author in reference units; render in device units. */
export const s = (n: number): number => Math.round(n * SCALE);

export const colors = {
  background: '#010305',
  foreground: '#FFFFFF',

  /** Liquid-glass card fill — white at 5%, per the web system. */
  card: 'rgba(255,255,255,0.05)',
  cardSolid: '#1C1C1C',
  cardForeground: '#FFFFFF',

  /** Modal/scrim fill — zinc-950 at 90%. */
  scrim: 'rgba(9,9,11,0.90)',

  border: 'rgba(255,255,255,0.10)',
  /** Focus is the only "accent" this UI has: a solid white edge. */
  borderFocused: '#FFFFFF',

  control: 'rgba(255,255,255,0.10)',
  controlFocused: '#F4F4F5',
  controlFocusedForeground: '#09090B',

  muted: '#2F2F2F',
  mutedForeground: '#A1A1AA',
  dimForeground: '#71717A',

  /** Semantic only. */
  live: '#EF4444',
  success: '#22C55E',
  destructive: '#EF4444',

  neutrals: {
    100: '#F9FBFF',
    200: '#DDE0E3',
    300: '#C2C4C7',
    400: '#A6A9AC',
    500: '#8B8D90',
    600: '#6F7174',
    700: '#383A3D',
    800: '#1D1F21',
    900: '#010305',
  },
} as const;

/**
 * 5% of each edge. Broadcast-era panels crop that much and plenty of TVs still
 * ship with overscan on by default, so anything inside this margin is not
 * guaranteed to be on screen. Every readable surface pads by it; only
 * backgrounds and video may cross it.
 */
export const OVERSCAN = { x: s(48), y: s(27) } as const;

export const spacing = {
  xs: s(4),
  sm: s(8),
  md: s(14),
  lg: s(20),
  xl: s(28),
  xxl: s(40),
} as const;

export const radius = {
  sm: s(6),
  md: s(10),
  lg: s(14),
  xl: s(20),
  pill: 999,
} as const;

/**
 * Font sizes are deliberately coarse. A 10-foot UI with eight type sizes reads
 * as noise; six sizes and weight contrast reads as hierarchy. The floor is
 * `meta` at 14sp on the reference panel, which is comfortably above the ~12sp
 * where TV text stops being legible from a sofa.
 */
export const type = {
  hero: { fontSize: s(42), lineHeight: s(50), fontFamily: 'Exo_700Bold' },
  title: { fontSize: s(28), lineHeight: s(36), fontFamily: 'Exo_600SemiBold' },
  rail: { fontSize: s(21), lineHeight: s(27), fontFamily: 'Exo_600SemiBold' },
  card: { fontSize: s(16), lineHeight: s(21), fontFamily: 'Exo_500Medium' },
  body: { fontSize: s(17), lineHeight: s(25), fontFamily: 'Exo_400Regular' },
  meta: { fontSize: s(14), lineHeight: s(19), fontFamily: 'Exo_400Regular' },
} as const;

/**
 * Tile geometry.
 *
 * `wide` is sized so a rail shows four tiles and the edge of a fifth. That last
 * sliver is doing real work — a row that ends flush at the screen edge gives no
 * signal that there is anything further right, and on a TV there is no scrollbar
 * and no drag to discover it with.
 */
export const cardSize = {
  /** 16:9 video poster. */
  wide: { width: s(176), height: s(99) },
  /** 9:16 shorts poster. */
  tall: { width: s(99), height: s(176) },
  /** 1:1 channel / stage tile. */
  square: { width: s(132), height: s(132) },
} as const;

/** How much a focused tile grows. Big enough to read across a room, small
 *  enough not to shove its neighbours out of the row. */
export const FOCUS_SCALE = 1.08;

export const RAIL_GAP = s(20);
