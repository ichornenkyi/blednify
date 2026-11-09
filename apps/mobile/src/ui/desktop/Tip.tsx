import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { usesFinePointer } from '../layout';
import { makeStyles, radius, space, useColors } from '../theme';
import { Text } from '../components/Text';

const DELAY_MS = 450;

/**
 * Hover tooltip with an optional keyboard shortcut, for icon-only controls in the wide layout.
 * Mouse only: touch users get no hover, and the control's accessibility label already names it.
 */
export function Tip({
  label,
  shortcut,
  side = 'top',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom';
  children: ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const enter = () => {
    if (!usesFinePointer()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(true), DELAY_MS);
  };
  const leave = () => {
    clearTimeout(timer.current);
    setShown(false);
  };

  return (
    <View onPointerEnter={enter} onPointerLeave={leave} onPointerDown={leave} style={styles.wrap}>
      {children}
      {shown ? (
        <View pointerEvents="none" style={[styles.anchor, side === 'top' ? styles.top : side === 'bottom' ? styles.bottom : styles.right]}>
          <View style={styles.bubble}>
            <Text variant="caption" color={colors.text} numberOfLines={1} style={styles.label}>
              {label}
            </Text>
            {shortcut ? <Kbd>{shortcut}</Kbd> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A keyboard key, e.g. in tooltips and the shortcut list. */
export function Kbd({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kbd}>
      <Text variant="mono" style={styles.kbdText}>
        {children}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { position: 'relative' },
  anchor: { position: 'absolute', zIndex: 50, alignItems: 'center' },
  top: { bottom: '100%', left: -200, right: -200, paddingBottom: space.sm },
  bottom: { top: '100%', left: -200, right: -200, paddingTop: space.sm },
  right: { left: '100%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: space.sm },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: colors.black,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  label: { fontWeight: '600', whiteSpace: 'nowrap' } as object,
  kbd: {
    paddingHorizontal: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  kbdText: { fontSize: 10, lineHeight: 12, color: colors.textSecondary },
}));
