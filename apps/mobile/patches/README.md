# Web tab pager regression checks

`react-native-tab-view@4.3.4.patch` fixes the web `PanResponderAdapter`. Android and iOS
continue to use their existing `PagerViewAdapter`; neither native adapter is patched here.
The dependency is pinned so an update cannot silently bypass this patch.

The web pager decides at pointer-down whether the gesture began in a horizontally scrollable
descendant. That descendant owns the whole gesture, including at the ends of its scroll range.
Touch events still reach the child so tapping and long-press actions keep working.

Web tab settling uses the browser's transform animation instead of a JavaScript spring.
It handles interrupted transitions, resize, cancellation and reduced motion. Unsupported
animation APIs retain the original fallback. Both source and compiled module are patched.

After changing the patch or upgrading tab-view, verify these cases with real pointer input:

- For Classic, Floating and Glass, swipe the Home song and album rails in both directions.
  The row must scroll while the route and pager translation remain on Home. Repeat at the
  row's end: an outward swipe must not navigate to Search.
- Tap and long-press a card after scrolling; playback and its action sheet must still work.
- Swipe the mini player to skip tracks: the track must change while the selected tab stays put.
- Swipe empty page space to change tabs; a short pull must rebound and cancellation must
  preserve the committed tab.
- Interrupt a transition with another tab tap or the opposite swipe. The final route, selected
  pill and visible page must agree. Resize during a transition and check again.
  After shrinking from 430px to 390px, the document and browser viewport must both stay 390px
  wide; the web root clips offscreen scenes to prevent them from expanding the viewport.
- Check tab selection by keyboard, direct tab URLs, reduced motion, and the fallback without
  `Element.animate`. On desktop, check rail arrow buttons and resizing to/from phone width.

Check pointer ownership and movement while the finger is down, not just the final URL. A
successful empty-space swipe does not cover the nested-scroller regression.
