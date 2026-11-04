import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

import { space } from '../theme';
import { SectionHeader } from './SectionHeader';

export const RAIL_CARD_WIDTH = 148;

/** Titled horizontal FlashList rail. */
export function Rail<T>({
  title,
  data,
  renderItem,
  keyExtractor,
  actionLabel,
  onAction,
}: {
  title: string;
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (data.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} />
      <FlashList
        horizontal
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Gap}
      />
    </View>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  content: { paddingHorizontal: space.lg },
  gap: { width: space.md },
});
