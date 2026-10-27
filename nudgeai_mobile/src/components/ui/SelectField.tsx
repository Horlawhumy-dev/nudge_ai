import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type SelectOption<T extends string> = { label: string; value: T };

type SelectFieldProps<T extends string> = {
  label?: string;
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Right-edge glyph; defaults to a chevron. */
  icon?: IconName;
  /** Slightly darker fill, used for nested selects inside a grey card. */
  nested?: boolean;
};

/** Dropdown that expands inline, so it works inside sheets without nested modals. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  icon,
  nested = false,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const fill = nested ? colors.borderSoft : colors.fill;

  return (
    <View>
      {label ? (
        <Text variant="subheading" color={colors.textSecondary} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, { backgroundColor: fill }]}
      >
        <Text
          variant="body"
          color={selected ? colors.text : colors.textPlaceholder}
          style={styles.value}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Icon
          name={icon ?? (open ? 'chevron-up' : 'chevron-down')}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          <ScrollView
            nestedScrollEnabled
            style={styles.menuScroll}
            keyboardShouldPersistTaps="handled"
          >
            {options.map((o) => (
              <Pressable
                key={o.value}
                accessibilityRole="menuitem"
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={[styles.item, o.value === value && { backgroundColor: colors.primaryTint }]}
              >
                <Text variant="body">{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 10 },
  field: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: { flex: 1 },
  menu: {
    marginTop: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  menuScroll: { maxHeight: 200 },
  item: { paddingHorizontal: 18, paddingVertical: 12 },
});
