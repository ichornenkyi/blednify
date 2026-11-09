import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '../components/Text';
import { PANEL_INLINE_MIN_WIDTH, SIDEBAR_FULL_MIN_WIDTH } from '../layout';
import { makeStyles, radius, space, useColors } from '../theme';
import { PlayerBar } from './PlayerBar';
import { SHORTCUTS, useShortcuts } from './shortcuts';
import { Sidebar } from './Sidebar';
import { SidePanel } from './SidePanel';
import { setPanel, setShortcutsOpen, useDesk } from './store';
import { Kbd } from './Tip';

/**
 * Wide layout (desktop browser, tablet): sidebar | page | queue or lyrics panel, with the player bar along
 * the bottom. The page column hosts the root stack, so detail pages and the Now playing view open there
 * while navigation and playback controls stay put.
 */
export function DesktopShell({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const panelOpen = useDesk((s) => s.panel !== null);
  const panelInline = width >= PANEL_INLINE_MIN_WIDTH;
  useShortcuts(true);
  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <Sidebar rail={width < SIDEBAR_FULL_MIN_WIDTH} />
        <View style={styles.page}>
          {children}
          {panelOpen && !panelInline ? (
            <Pressable style={styles.scrim} accessibilityLabel="Close panel" onPress={() => setPanel(null)} />
          ) : null}
          {panelInline ? null : <SidePanel overlay />}
        </View>
        {panelInline ? <SidePanel overlay={false} /> : null}
      </View>
      <PlayerBar />
      <ShortcutsOverlay />
    </View>
  );
}

function ShortcutsOverlay() {
  const styles = useStyles();
  const colors = useColors();
  const open = useDesk((s) => s.shortcuts);
  if (!open) return null;
  return (
    <View style={styles.dialogHost}>
      <Pressable style={[StyleSheet.absoluteFill, styles.dialogScrim]} accessibilityLabel="Close" onPress={() => setShortcutsOpen(false)} />
      <View style={styles.dialog} role="dialog" aria-modal aria-label="Keyboard shortcuts">
        <Text variant="heading">Keyboard shortcuts</Text>
        <View style={styles.columns}>
          {SHORTCUTS.map((group) => (
            <View key={group.title} style={styles.column}>
              <Text variant="micro" color={colors.textTertiary}>
                {group.title.toUpperCase()}
              </Text>
              {group.items.map((s) => (
                <View key={s.label} style={styles.shortcut}>
                  <Text variant="body" style={styles.flex}>
                    {s.label}
                  </Text>
                  <Kbd>{s.keys}</Kbd>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  main: { flex: 1, flexDirection: 'row', minHeight: 0 },
  page: { flex: 1, minWidth: 0, overflow: 'hidden' },
  scrim: { ...StyleSheet.absoluteFill, zIndex: 19, backgroundColor: colors.scrim },
  flex: { flex: 1 },
  dialogHost: { ...StyleSheet.absoluteFill, zIndex: 100, alignItems: 'center', justifyContent: 'center' },
  dialogScrim: { backgroundColor: colors.scrim },
  dialog: {
    width: 640,
    maxWidth: '92%',
    padding: space.xl,
    gap: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: colors.black,
    shadowOpacity: 0.5,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
  },
  columns: { flexDirection: 'row', gap: space.xxl, flexWrap: 'wrap' },
  column: { flex: 1, minWidth: 240, gap: space.sm },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 28 },
}));
