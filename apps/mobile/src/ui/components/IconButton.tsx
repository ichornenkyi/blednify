import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '../haptics';
import { colors } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

type Variant = 'plain' | 'filled' | 'accent' | 'scrim';

export type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: number;
  /** Diameter of the touch target / background circle. */
  diameter?: number;
  color?: string;
  variant?: Variant;
  haptic?: boolean;
  disabled?: boolean;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

const BG: Record<Variant, string | undefined> = {
  plain: undefined,
  filled: colors.surface2,
  accent: colors.accent,
  scrim: 'rgba(10,10,12,0.55)',
};

export function IconButton({
  icon,
  label,
  onPress,
  onLongPress,
  size = 22,
  diameter = 44,
  color,
  variant = 'plain',
  haptic = false,
  disabled,
  strokeWidth,
  style,
}: IconButtonProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={diameter < 44 ? (44 - diameter) / 2 : 0}
      disabled={disabled}
      activeScale={0.88}
      onLongPress={onLongPress}
      onPress={() => {
        if (haptic) haptics.tap();
        onPress?.();
      }}
      style={[
        styles.base,
        { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: BG[variant] },
        disabled && styles.disabled,
        style,
      ]}>
      <Icon
        name={icon}
        size={size}
        color={color ?? (variant === 'accent' ? colors.white : colors.text)}
        strokeWidth={strokeWidth}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
});
