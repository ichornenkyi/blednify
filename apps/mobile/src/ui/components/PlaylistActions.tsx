import { View } from 'react-native';

import { createPlaylist, deletePlaylist, renamePlaylist, type Playlist } from '@/core';

import { attempt } from '../actions';
import { nav } from '../nav';
import { showSheet } from '../overlay';
import { confirm } from './ConfirmSheet';
import { SheetAction, SheetHeader } from './ActionSheet';
import { PromptSheet } from './PromptSheet';

/** Ask for a name, create the playlist and open it. */
export function promptNewPlaylist() {
  showSheet(
    <PromptSheet
      title="New playlist"
      placeholder="Playlist name"
      submitLabel="Create"
      onSubmit={async (name) => {
        const id = await attempt(createPlaylist(name));
        if (id) nav.playlist(id);
      }}
    />,
  );
}

export function openPlaylistActions(p: Playlist, opts: { onDeleted?: () => void } = {}) {
  showSheet(
    <View>
      <SheetHeader title={p.name} subtitle={`${p.trackCount} ${p.trackCount === 1 ? 'track' : 'tracks'}`} />
      <SheetAction
        icon="pencil-outline"
        label="Rename"
        keepOpen
        onPress={() =>
          showSheet(
            <PromptSheet
              title="Rename playlist"
              initialValue={p.name}
              onSubmit={(name) => void attempt(renamePlaylist(p.id, name), 'Playlist renamed')}
            />,
          )
        }
      />
      <SheetAction
        icon="trash-outline"
        label="Delete playlist"
        destructive
        onPress={() =>
          confirm({
            title: 'Delete playlist?',
            message: `“${p.name}” will be deleted. Tracks stay in your library.`,
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: async () => {
              const ok = await attempt(
                deletePlaylist(p.id).then(() => true),
                'Playlist deleted',
              );
              if (ok) opts.onDeleted?.();
            },
          })
        }
      />
    </View>,
  );
}
