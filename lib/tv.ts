import { Platform, View } from 'react-native';
import type { ComponentType } from 'react';

/**
 * TV platform surface, behind a soft import.
 *
 * `react-native-tvos` adds `TVFocusGuideView` and `useTVEventHandler` to the
 * `react-native` module, but plain `react-native` does not have them. Importing
 * either by name means this codebase only compiles against the fork — and the
 * fastest way to iterate on a rail's spacing is to run it in a normal Expo
 * client on a phone, where the fork is not installed.
 *
 * So they are resolved at runtime with a plain-View / no-op fallback. On a TV
 * build every one of these is the real implementation; off a TV they degrade to
 * something harmless rather than crashing at import time.
 */
const RN: Record<string, any> = require('react-native');

export const isTV: boolean = (Platform as any).isTV === true;

/**
 * Redirects D-pad focus into or around a subtree.
 *
 * The case it exists for: a rail whose first tile is off-screen to the left
 * after the user scrolled. Without a guide, pressing UP from the row below
 * lands focus on whatever tile happens to be nearest in raw geometry, which
 * from the user's side reads as the focus ring teleporting.
 */
export const TVFocusGuideView: ComponentType<any> = RN.TVFocusGuideView ?? View;

export type TVEvent = {
  eventType:
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | 'select'
    | 'playPause'
    | 'menu'
    | 'longSelect'
    | 'blur'
    | 'focus'
    | string;
  eventKeyAction?: number;
  tag?: number;
};

type TVEventHandler = (evt: TVEvent) => void;

/**
 * Remote key events that are not focus movement — play/pause, menu, rewind.
 * Everything that IS focus movement should be left to the focus engine; a hand
 * -rolled D-pad handler fights it and loses.
 */
export const useTVEventHandler: (handler: TVEventHandler) => void =
  RN.useTVEventHandler ?? (() => {});
