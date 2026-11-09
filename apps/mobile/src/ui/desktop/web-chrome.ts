import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useColors, withAlpha } from '../theme';

const STYLE_ID = 'blednify-chrome';

/**
 * Browser-drawn surfaces themed from the palette: scrollbars, text selection, keyboard focus rings and the
 * page background behind the app. Re-applied when the theme changes.
 */
export function useWebChrome() {
  const colors = useColors();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    const thumb = withAlpha(colors.isLight ? '#000000' : '#FFFFFF', 0.16);
    const thumbHover = withAlpha(colors.isLight ? '#000000' : '#FFFFFF', 0.3);
    el.textContent = `
html, body { background: ${colors.bg}; color-scheme: ${colors.isLight ? 'light' : 'dark'}; }
* { scrollbar-width: thin; scrollbar-color: ${thumb} transparent; }
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: ${thumb}; border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }
*::-webkit-scrollbar-thumb:hover { background: ${thumbHover}; border: 3px solid transparent; background-clip: padding-box; }
::selection { background: ${withAlpha(colors.accent, 0.35)}; color: ${colors.text}; }
input, textarea { caret-color: ${colors.accent}; }
:focus { outline: none; }
:focus-visible { outline: 2px solid ${colors.accent}; outline-offset: 2px; border-radius: 6px; }
input:focus-visible, textarea:focus-visible { outline: none; }
`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
  }, [colors]);
}
