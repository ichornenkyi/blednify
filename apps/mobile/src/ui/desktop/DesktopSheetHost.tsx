import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { closeSheet, useOverlay } from '../overlay';
import { makeStyles, radius, space } from '../theme';

const MENU_WIDTH = 288;
const DIALOG_WIDTH = 440;
const EDGE = 8;

/**
 * Sheets in the wide layout. Opened from a right-click (`anchor`), the content becomes a context menu at the
 * cursor; otherwise a centered dialog. Click outside or Esc (see shortcuts) closes it.
 */
export function DesktopSheetHost() {
  const styles = useStyles();
  const sheet = useOverlay((s) => s.sheet);
  const { width: winW, height: winH } = useWindowDimensions();
  const [size, setSize] = useState<{ id: number; h: number } | null>(null);
  const box = useRef<ComponentRef<typeof View>>(null);

  // Keep keyboard focus inside: focus the menu so arrow keys / Tab start from it.
  useEffect(() => {
    if (!sheet) return;
    const el = box.current as unknown as HTMLElement | null;
    el?.focus?.({ preventScroll: true });
  }, [sheet]);

  if (!sheet) return null;
  const { anchor } = sheet;
  const measured = size?.id === sheet.id ? size.h : null;

  let frame: object;
  if (anchor) {
    const h = measured ?? 0;
    const left = Math.max(EDGE, Math.min(anchor.x, winW - MENU_WIDTH - EDGE));
    // Open downward when it fits, else upward from the cursor, else pinned to the bottom edge.
    const top = anchor.y + h + EDGE <= winH ? anchor.y : Math.max(EDGE, Math.min(anchor.y - h, winH - h - EDGE));
    frame = { left, top, width: MENU_WIDTH, maxHeight: winH - EDGE * 2 };
  } else {
    frame = { alignSelf: 'center', width: Math.min(DIALOG_WIDTH, winW - EDGE * 4), maxHeight: winH * 0.86 };
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.host, !anchor && styles.center]}>
      <Pressable
        style={[StyleSheet.absoluteFill, !anchor && styles.scrim]}
        accessibilityLabel="Close"
        onPress={closeSheet}
        {...({
          onContextMenu: (e: MouseEvent) => {
            e.preventDefault();
            closeSheet();
          },
        } as object)}
      />
      <View
        ref={box}
        key={sheet.id}
        role={anchor ? 'menu' : 'dialog'}
        aria-modal={!anchor}
        tabIndex={-1}
        onLayout={(e) => setSize({ id: sheet.id, h: e.nativeEvent.layout.height })}
        style={[
          styles.card,
          anchor ? styles.menu : styles.dialog,
          frame,
          // Hidden for the first frame of a menu, until its height is known and it can be placed.
          anchor && measured === null && styles.measuring,
        ]}>
        <ScrollView style={styles.scroll} contentContainerStyle={anchor ? styles.menuContent : styles.dialogContent}>
          {sheet.content}
        </ScrollView>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  host: { zIndex: 1000 },
  center: { justifyContent: 'center' },
  scrim: { backgroundColor: colors.scrim },
  card: {
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: colors.black,
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    overflow: 'hidden',
    animationKeyframes: [{ from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'scale(1)' } }],
    animationDuration: '120ms',
    animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  } as object,
  menu: { position: 'absolute', borderRadius: radius.md, transformOrigin: 'top left' } as object,
  dialog: { borderRadius: radius.lg },
  measuring: { opacity: 0 },
  scroll: { flexGrow: 0 },
  menuContent: { paddingVertical: space.xs },
  dialogContent: { paddingVertical: space.sm },
}));
