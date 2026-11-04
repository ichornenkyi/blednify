import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { type } from '../theme';

export type TextVariant = keyof typeof type;
export type TextProps = RNTextProps & { variant?: TextVariant; color?: string };

export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[type[variant], color !== undefined && { color }, style]} />;
}
