import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '../haptics';
import { useGlassSurface } from '../chrome';
import { makeStyles, radius, space, useColors } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Variant = 'accent' | 'danger' | 'surface' | 'outline';

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ label, onPress, icon, variant = 'accent', size = 'md', loading, disabled, style }: PrimaryButtonProps) {
  const styles = useStyles();
  const colors = useColors();
  const glass = useGlassSurface();
  const fg = variant === 'accent' ? colors.onAccent : variant === 'danger' ? colors.white : colors.text;
  const inactive = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        haptics.press();
        onPress();
      }}
      style={[styles.base, size === 'lg' ? styles.lg : styles.md, styles[variant], variant === 'surface' && glass, disabled && styles.disabled, style]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={size === 'lg' ? 20 : 18} color={fg} /> : null}
      <Text variant="bodyStrong" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((colors) => ({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.pill },
  md: { height: 44, paddingHorizontal: space.lg + 4 },
  lg: { height: 52, paddingHorizontal: space.xl },
  accent: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.danger },
  surface: { backgroundColor: colors.surface2 },
  outline: { borderWidth: 1, borderColor: colors.borderStrong },
  disabled: { opacity: 0.4 },
}));
