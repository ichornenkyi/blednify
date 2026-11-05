import { libIndex } from './lib-index';
import { readLibrary } from './web-library';

export async function loadLibIndex(): Promise<void> {
  libIndex.setState({ ready: true, liked: new Set(readLibrary().likes.map((l) => l.track.key)) });
}
