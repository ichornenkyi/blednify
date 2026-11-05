/**
 * Web audio backend: the slice of expo-audio's `AudioPlaylist` that the engine uses, on one `<audio>` element.
 *
 * expo-audio's own web playlist creates a new element per track. iOS only lets an element start without a
 * tap once it has been started by one, so a fresh element per track can stall playback at the track
 * boundary, especially with the screen locked. Here a single, module-level element is unlocked by the first
 * touch and only ever has its `src` swapped; it also survives the engine recreating the playlist after an error.
 *
 * Track changes are not sample-accurate gapless: the browser has to load the next file when one ends.
 */
import type { AudioMetadata, AudioPlaylist, AudioPlaylistStatus } from 'expo-audio';

// Circular with the engine, which is safe: `player` is only read when a lock-screen button is pressed.
import { player } from './engine';

type Source = { uri: string; name?: string };
type Listener = (status: AudioPlaylistStatus & { error?: unknown }) => void;
type LockScreenOptions = { showNextTrack?: boolean; showPreviousTrack?: boolean };

const SEEK_TIMEOUT_MS = 3_000;
/** Shortest valid silent WAV, played once inside the first touch to unlock the element. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
const EVENTS = [
  'loadedmetadata',
  'durationchange',
  'canplay',
  'playing',
  'pause',
  'waiting',
  'seeked',
  'timeupdate',
  'ended',
  'error',
] as const;

/** Created at startup, not on first play: the very first touch has to reach `unlock`. */
const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

function unlock() {
  document.removeEventListener('touchend', unlock, true);
  document.removeEventListener('click', unlock, true);
  if (audio.getAttribute('src')) return; // already started by this same gesture
  audio.src = SILENCE;
  audio
    .play()
    .then(() => {
      if (audio.src === SILENCE) audio.pause();
    })
    .catch(() => undefined)
    .finally(() => {
      if (audio.src === SILENCE) audio.removeAttribute('src');
    });
}
document.addEventListener('touchend', unlock, true);
document.addEventListener('click', unlock, true);

class WebPlaylist {
  private sources: Source[] = [];
  private cur = 0;
  private listeners = new Set<Listener>();
  private el = audio;
  private lockScreen = false;
  private seeksInFlight = 0;
  loop: 'none' | 'single' | 'all' = 'none';

  constructor() {
    for (const name of EVENTS) this.el.addEventListener(name, this.onEvent);
  }

  get currentIndex() {
    return this.cur;
  }
  get trackCount() {
    return this.sources.length;
  }

  private hasMedia() {
    const src = this.el.getAttribute('src');
    return !!src && src !== SILENCE;
  }

  private status(extra?: { didJustFinish?: boolean; error?: string }): AudioPlaylistStatus & { error?: unknown } {
    const { el } = this;
    const media = this.hasMedia();
    const isLoaded = media && el.readyState >= HTMLMediaElement.HAVE_METADATA;
    return {
      id: 'web',
      currentIndex: this.cur,
      trackCount: this.sources.length,
      currentTime: media ? el.currentTime : 0,
      duration: media && Number.isFinite(el.duration) ? el.duration : 0,
      playing: media && !el.paused && !el.ended,
      isBuffering: media && !el.paused && el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
      isLoaded,
      playbackRate: el.playbackRate,
      muted: el.muted,
      volume: el.volume,
      loop: this.loop,
      didJustFinish: false,
      ...extra,
    };
  }

  private emit(extra?: { didJustFinish?: boolean; error?: string }) {
    const s = this.status(extra);
    for (const l of this.listeners) l(s);
  }

  private onEvent = (e: Event) => {
    if (!this.hasMedia()) return;
    // Browsers fire `pause` right before `ended`; reporting it would flash "paused" between tracks.
    if (this.el.ended && e.type !== 'ended') return;
    // While paused, a status mid-seek would read as an external pause and cancel the engine's resume-after-seek.
    if (this.seeksInFlight > 0 && e.type !== 'error') return;
    switch (e.type) {
      case 'ended':
        this.onEnded();
        return;
      case 'error':
        this.emit({ error: this.el.error?.message || 'This track could not be played' });
        return;
      case 'playing':
      case 'pause':
        if ('mediaSession' in navigator && this.lockScreen)
          navigator.mediaSession.playbackState = e.type === 'playing' ? 'playing' : 'paused';
        break;
      case 'durationchange':
      case 'seeked':
        this.syncPositionState();
        break;
    }
    this.emit();
  };

  private onEnded() {
    if (this.loop === 'single') {
      this.el.currentTime = 0;
      this.startElement();
    } else if (this.cur + 1 < this.sources.length) {
      this.moveTo(this.cur + 1, true);
    } else {
      this.emit({ didJustFinish: true });
    }
  }

  private startElement() {
    // Real media failures arrive through the element's `error` event; a rejection here only changes state.
    this.el.play().catch(() => this.emit());
  }

  private moveTo(index: number, play: boolean) {
    const src = this.sources[index];
    if (!src) return;
    this.cur = index;
    this.el.src = src.uri;
    if (play) this.startElement();
    this.emit();
  }

  add(source: Source) {
    this.sources.push(source);
  }

  remove(index: number) {
    this.sources.splice(index, 1);
    if (index < this.cur) this.cur--;
  }

  clear() {
    this.sources = [];
    this.cur = 0;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    // Its `pause` event arrives after the source is gone, so `onEvent` won't report it.
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    this.emit();
  }

  skipTo(index: number) {
    this.moveTo(index, !this.el.paused);
  }

  play() {
    if (this.hasMedia()) this.startElement();
  }

  pause() {
    this.el.pause();
  }

  next() {
    this.moveTo(this.cur + 1, !this.el.paused);
  }

  previous() {
    this.moveTo(this.cur - 1, !this.el.paused);
  }

  seekTo(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.el.removeEventListener('seeked', done);
        this.seeksInFlight--;
        resolve();
        // After the awaiting code has run, so it can call play() before anyone sees the paused state.
        setTimeout(() => this.emit(), 0);
      };
      const timer = setTimeout(done, SEEK_TIMEOUT_MS);
      this.seeksInFlight++;
      this.el.addEventListener('seeked', done);
      this.el.currentTime = seconds;
    });
  }

  addListener(_event: 'playlistStatusUpdate', listener: Listener) {
    this.listeners.add(listener);
    return { remove: () => void this.listeners.delete(listener) };
  }

  destroy() {
    this.el.pause();
    for (const name of EVENTS) this.el.removeEventListener(name, this.onEvent);
    this.clearLockScreenControls();
    this.listeners.clear();
  }

  release() {}

  // --- Lock screen -----------------------------------------------------------------------------

  private syncPositionState() {
    if (!this.lockScreen || !('mediaSession' in navigator)) return;
    const { duration, currentTime } = this.el;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({ duration, position: Math.min(currentTime, duration), playbackRate: 1 });
    } catch {
      // Purely cosmetic.
    }
  }

  setActiveForLockScreen(active: boolean, metadata?: AudioMetadata, options?: LockScreenOptions) {
    if (!active) return this.clearLockScreenControls();
    if (!('mediaSession' in navigator)) return;
    this.lockScreen = true;
    if (metadata) this.updateLockScreenMetadata(metadata);
    const session = navigator.mediaSession;
    session.setActionHandler('play', () => this.play());
    session.setActionHandler('pause', () => this.pause());
    session.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) this.el.currentTime = d.seekTime;
    });
    // Through the engine: this playlist only holds a window of the queue, and repeat-all lives there too.
    session.setActionHandler('nexttrack', options?.showNextTrack ? () => player.next() : null);
    session.setActionHandler('previoustrack', options?.showPreviousTrack ? () => player.previous() : null);
  }

  updateLockScreenMetadata(m: AudioMetadata) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: m.title ?? '',
      artist: m.artist ?? '',
      album: m.albumTitle ?? '',
      artwork: m.artworkUrl ? [{ src: m.artworkUrl }] : [],
    });
  }

  clearLockScreenControls() {
    this.lockScreen = false;
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = null;
    for (const action of ['play', 'pause', 'seekto', 'nexttrack', 'previoustrack'] as const)
      session.setActionHandler(action, null);
  }
}

export function createAudioPlaylist(_options?: { updateInterval?: number; loop?: string }): AudioPlaylist {
  return new WebPlaylist() as unknown as AudioPlaylist;
}

/** iOS decides the audio session for the page; there is nothing to configure. */
export async function setAudioModeAsync(_mode: unknown): Promise<void> {}

export async function requestNotificationPermissionsAsync(): Promise<void> {}
