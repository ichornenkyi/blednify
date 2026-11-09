import { router } from 'expo-router';
import { useEffect } from 'react';

import { useIsWide } from '../layout';
import { setPanel, type PanelKind } from './store';

/**
 * The wide layout shows the queue and lyrics in its side panel. Landing on their phone routes there (a
 * bookmark, a typed URL) opens the panel and returns to the page underneath. Returns true while redirecting.
 */
export function useWideRedirect(panel: PanelKind): boolean {
  const wide = useIsWide();
  useEffect(() => {
    if (!wide) return;
    setPanel(panel);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [wide, panel]);
  return wide;
}
