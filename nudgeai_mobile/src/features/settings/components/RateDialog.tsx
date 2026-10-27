import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radius } from '@/theme';

type RateDialogProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (stars: number) => void;
};

const LABELS = ['', 'Not great', 'Could be better', 'Pretty good', 'Really good', 'Love it!'];

/** Five-star rating prompt. Wire `onSubmit` to the store/review API when one exists. */
export function RateDialog({ visible, onClose, onSubmit }: RateDialogProps) {
  const [stars, setStars] = useState(0);

  const close = () => {
    onClose();
    setStars(0);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
          <Text variant="heading" align="center">
            Enjoying Nudge?
          </Text>
          <Text variant="bodyLarge" color={colors.textSecondary} align="center">
            Tap a star to rate your experience.
          </Text>
          <View style={styles.stars} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                accessibilityState={{ selected: stars === n }}
                hitSlop={6}
                onPress={() => {
                  haptics.select();
                  setStars(n);
                }}
              >
                <Icon
                  name={n <= stars ? 'star' : 'star-outline'}
                  size={38}
                  color={n <= stars ? '#F5B301' : colors.border}
                />
              </Pressable>
            ))}
          </View>
          <Text variant="bodyMedium" color={colors.primary} align="center" style={styles.label}>
            {LABELS[stars]}
          </Text>
          <View style={styles.actions}>
            <Button label="Not now" variant="secondary" onPress={close} style={styles.action} />
            <Button
              label="Submit"
              disabled={stars === 0}
              onPress={() => {
                onSubmit(stars);
                close();
              }}
              style={styles.action}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 24,
    gap: 10,
  },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 14 },
  label: { height: 22, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 10 },
  action: { flex: 1 },
});
