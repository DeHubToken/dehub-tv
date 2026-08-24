import React from 'react';
import { Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { colors, type, s } from '../config/theme';

type Variant = keyof typeof type;

export interface TxtProps {
  children: React.ReactNode;
  variant?: Variant;
  color?: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  uppercase?: boolean;
}

/**
 * Typography wrapper.
 *
 * It exists to stop font sizes being written inline. On a phone an off-by-two
 * font size is a nitpick; on a TV it is the difference between a caption
 * someone can read from the sofa and one they lean forward for, and the only
 * way to hold that line across dozens of call sites is a closed set of
 * variants. Anything that needs a size not in `type` is a design decision, not
 * a style override.
 */
export function Txt({
  children,
  variant = 'body',
  color = colors.foreground,
  numberOfLines,
  style,
  uppercase,
}: TxtProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        type[variant],
        { color },
        uppercase && styles.uppercase,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  uppercase: {
    textTransform: 'uppercase',
    letterSpacing: s(1.2),
  },
});
