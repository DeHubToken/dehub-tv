import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, FOCUS_SCALE, s } from '../config/theme';

export interface FocusableProps {
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Give this element focus when its screen mounts. Exactly one per screen. */
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Grow on focus. Off for full-width rows, where scaling shifts the text. */
  scaleOnFocus?: boolean;
  scale?: number;
  /** Draw the white focus edge. Off when the child paints its own. */
  ring?: boolean;
  borderRadius?: number;
  disabled?: boolean;
  testID?: string;
}

/**
 * Every focusable thing in the app.
 *
 * A TV has one pointer and it is the focus ring, so the ring is not decoration
 * — it is the cursor. Three things follow from that, and all three are the
 * reason this is a component rather than a prop on each call site:
 *
 * 1. **The focused element must be unmistakable across a room.** A subtle
 *    border is a desktop hover state. Here it is a solid white 3px edge plus a
 *    size change, which reads even out of focus in peripheral vision.
 * 2. **The size change must be cheap.** It runs on every D-pad press, so it is
 *    a native-driven transform rather than a layout change — animating width
 *    would re-flow the whole rail sixty times a second.
 * 3. **Focus and press are different events.** On a TV, moving onto an element
 *    is not selecting it, and code that treats `onFocus` as intent (starting
 *    playback, marking as seen) fires on every pass-through.
 */
export function Focusable({
  children,
  onPress,
  onFocus,
  onBlur,
  autoFocus,
  style,
  scaleOnFocus = true,
  scale = FOCUS_SCALE,
  ring = true,
  borderRadius = radius.md,
  disabled,
  testID,
}: FocusableProps) {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback(
    (to: number) => {
      Animated.timing(anim, {
        toValue: to,
        duration: 140,
        useNativeDriver: true,
      }).start();
    },
    [anim],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    if (scaleOnFocus) animateTo(1);
    onFocus?.();
  }, [animateTo, onFocus, scaleOnFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (scaleOnFocus) animateTo(0);
    onBlur?.();
  }, [animateTo, onBlur, scaleOnFocus]);

  const scaleStyle = scaleOnFocus
    ? { transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }] }
    : undefined;

  return (
    <Pressable
      testID={testID}
      focusable={!disabled}
      disabled={disabled}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={autoFocus}
      style={style}
    >
      <Animated.View
        style={[
          styles.inner,
          { borderRadius },
          scaleStyle,
          ring && focused ? [styles.ring, { borderRadius: borderRadius + s(2) }] : styles.ringIdle,
        ]}
      >
        {typeof children === 'function' ? children(focused) : children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inner: {
    overflow: 'visible',
  },
  ring: {
    borderWidth: s(2),
    borderColor: colors.borderFocused,
    // A focused tile has to lift off the rail, not just outline. On Android
    // this is the only shadow property that does anything.
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: s(14),
    shadowOffset: { width: 0, height: s(6) },
  },
  ringIdle: {
    borderWidth: s(2),
    // Transparent rather than absent: a border that only appears on focus
    // changes the element's size by twice its width and nudges every tile in
    // the row sideways.
    borderColor: 'transparent',
  },
});
