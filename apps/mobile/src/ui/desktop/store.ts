import { create, useStore } from 'zustand';

import { kv } from '@/core/settings';

export type PanelKind = 'queue' | 'lyrics';

type DeskState = {
  /** Right-hand panel beside the page, or none. */
  panel: PanelKind | null;
  /** Bumped to ask the Search screen to focus its field (Ctrl+K, "/"). */
  searchFocus: number;
  /** Keyboard shortcut overview is open. */
  shortcuts: boolean;
};

const PANEL_KEY = 'desktop.panel.v1';

function loadPanel(): PanelKind | null {
  const v = kv.getString(PANEL_KEY);
  return v === 'queue' || v === 'lyrics' ? v : null;
}

export const deskStore = create<DeskState>(() => ({ panel: loadPanel(), searchFocus: 0, shortcuts: false }));

export function useDesk<T>(selector: (s: DeskState) => T): T {
  return useStore(deskStore, selector);
}

export function setPanel(panel: PanelKind | null) {
  deskStore.setState({ panel });
  if (panel) kv.set(PANEL_KEY, panel);
  else kv.remove(PANEL_KEY);
}

/** Opens `panel`, or closes it when it is already the open one. */
export function togglePanel(panel: PanelKind) {
  setPanel(deskStore.getState().panel === panel ? null : panel);
}

export function requestSearchFocus() {
  deskStore.setState((s) => ({ searchFocus: s.searchFocus + 1 }));
}

export function setShortcutsOpen(open: boolean) {
  deskStore.setState({ shortcuts: open });
}
