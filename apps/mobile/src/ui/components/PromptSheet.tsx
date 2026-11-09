import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { closeSheet } from '../overlay';
import { makeStyles, radius, space, useColors } from '../theme';
import { PrimaryButton } from './PrimaryButton';
import { Text } from './Text';

export function PromptSheet({
  title,
  initialValue = '',
  placeholder,
  submitLabel = 'Save',
  onSubmit,
}: {
  title: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const submit = () => {
    if (!trimmed) return;
    closeSheet();
    onSubmit(trimmed);
  };
  return (
    <View style={styles.root}>
      <Text variant="heading">{title}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoFocus
        selectTextOnFocus
        maxLength={100}
        returnKeyType="done"
        onSubmitEditing={submit}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={styles.input}
      />
      <View style={styles.buttons}>
        <PrimaryButton label="Cancel" variant="surface" onPress={closeSheet} style={styles.flex} />
        <PrimaryButton label={submitLabel} onPress={submit} disabled={!trimmed} style={styles.flex} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.lg },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.lg,
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  buttons: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
}));
