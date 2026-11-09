import { useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';

import { makeStyles, useColors } from '../theme';

type Props = {
  /** 0..1 */
  value: number;
  /** Live value while dragging (also called once on press). */
  onScrub?: (value: number) => void;
  /** Final value on release; also used for keyboard steps. */
  onCommit: (value: number) => void;
  label: string;
  /** Spoken value, e.g. "1:23 of 3:40". */
  valueText?: string;
  /** Keyboard step as a fraction of the range. */
  step?: number;
  disabled?: boolean;
};

const HIT = 20;
const TRACK = 4;
const THUMB = 12;

/**
 * Mouse / pen / touch slider for the wide layout (web only): pointer capture keeps the drag alive when the
 * cursor leaves the bar, and the fill turns accent with a thumb on hover, like desktop media players.
 */
export function Slider({ value, onScrub, onCommit, label, valueText, step = 0.05, disabled }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState(false);
  const shown = Math.min(1, Math.max(0, drag ?? value));
  const active = hover || drag !== null;

  const ratioAt = (clientX: number) => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
  };

  const web = {
    onPointerDown: (e: PointerEvent) => {
      if (disabled || e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = true;
      const v = ratioAt(e.clientX);
      setDrag(v);
      onScrub?.(v);
    },
    onPointerMove: (e: PointerEvent) => {
      if (!dragging.current) return;
      const v = ratioAt(e.clientX);
      setDrag(v);
      onScrub?.(v);
    },
    onPointerUp: (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const v = ratioAt(e.clientX);
      setDrag(null);
      onCommit(v);
    },
    onPointerCancel: () => {
      dragging.current = false;
      setDrag(null);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (disabled) return;
      const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
      if (!delta) return;
      e.preventDefault();
      e.stopPropagation();
      onCommit(Math.min(1, Math.max(0, value + delta)));
    },
  };

  return (
    <View
      ref={ref}
      focusable={!disabled}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100), text: valueText }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={[styles.hit, disabled && styles.disabled]}
      {...(web as object)}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${shown * 100}%`, backgroundColor: active ? colors.accent : colors.text }]} />
      </View>
      {active && !disabled ? <View pointerEvents="none" style={[styles.thumb, { left: `${shown * 100}%` }]} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hit: { height: HIT, justifyContent: 'center', cursor: 'pointer', touchAction: 'none' } as object,
  disabled: { opacity: 0.4, cursor: 'default' } as object,
  track: { height: TRACK, borderRadius: TRACK / 2, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: TRACK / 2 },
  thumb: {
    position: 'absolute',
    top: (HIT - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    shadowColor: colors.black,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
}));
