import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useType, type TypeVariant } from '../theme';

export type TextVariant = TypeVariant;
export type TextProps = RNTextProps & { variant?: TextVariant; color?: string };

export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  const type = useType();
  return <RNText {...rest} style={[type[variant], color !== undefined && { color }, style]} />;
}
