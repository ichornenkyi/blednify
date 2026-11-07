/** Streaming only on web (see `supportsOffline`); the UI hides import, so these are inert. */
export async function importFromDevice(): Promise<{ imported: number; skipped: number }> {
  return { imported: 0, skipped: 0 };
}
export async function deleteLocalTrack(_key: string): Promise<void> {}
