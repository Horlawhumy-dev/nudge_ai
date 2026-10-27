import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/components/ui';
import { colors, gradients, shadows } from '@/theme';

type SideButton = { icon: IconName; label: string; onPress: () => void };

type VoiceDockProps = {
  status: string;
  left: SideButton;
  right: SideButton;
  onMic: () => void;
  micLabel: string;
};

function Side({ icon, label, onPress }: SideButton) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.side}
    >
      <Icon name={icon} size={26} />
    </Pressable>
  );
}

/** Bottom gradient dock with status text and the three voice controls. */
export function VoiceDock({ status, left, right, onMic, micLabel }: VoiceDockProps) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={gradients.voiceDock}
      style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) + 18 }]}
    >
      <Text variant="bodyLarge" align="center" style={styles.status}>
        {status}
      </Text>
      <View style={styles.row}>
        <Side {...left} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={micLabel}
          onPress={onMic}
          style={styles.micRing}
        >
          <View style={styles.mic}>
            <Icon name="pulse" size={34} color={colors.white} />
          </View>
        </Pressable>
        <Side {...right} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  dock: { paddingTop: 80, paddingHorizontal: 40, gap: 34 },
  status: { marginBottom: -4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRing: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
  mic: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
