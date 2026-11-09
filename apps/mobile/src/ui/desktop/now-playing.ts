import { router } from 'expo-router';

import { playerStore } from '@/core/player/store';

/** The wide layout's Now playing view is the `/player` route, drawn over the page column. */
function isOpen(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === '/player';
}

export function openNowPlaying() {
  if (isOpen() || !playerStore.getState().current) return;
  router.push('/player');
}

export function closeNowPlaying() {
  if (!isOpen()) return;
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function toggleNowPlaying() {
  if (isOpen()) closeNowPlaying();
  else openNowPlaying();
}
