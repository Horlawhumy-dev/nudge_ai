import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Icon, Text, Waveform } from '@/components/ui';
import { colors, radius } from '@/theme';

const WAVE = [
  0.3, 0.6, 0.9, 0.5, 0.75, 1, 0.55, 0.8, 0.4, 0.95, 0.6, 0.85, 0.45, 0.7, 0.35, 0.9, 0.5, 0.65,
  0.3, 0.8,
];

/** Slide 1: a phone mock-up showing a spoken alarm. Bleeds off the bottom edge. */
export function AlarmArt({ background }: { background: string }) {
  return (
    <View style={styles.alarmWrap}>
      <View style={styles.alarm}>
        <Image
          source={require('@/assets/images/onboarding-alarm.png')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityLabel="A phone showing a spoken reminder: Go for a run, 6:30"
        />
        <LinearGradient
          pointerEvents="none"
          colors={[`${background}00`, background]}
          style={styles.alarmFade}
        />
      </View>
    </View>
  );
}

/** Slide 2: tilted chat bubbles ending in a voice notification. */
export function RhythmArt() {
  return (
    <View style={styles.rhythm}>
      <View style={[styles.bubble, styles.bubbleOne]}>
        <Image
          source={require('@/assets/images/memoji.png')}
          style={styles.memoji}
          contentFit="cover"
        />
        <Text variant="bodyLarge" color={colors.textSecondary} style={styles.bubbleText}>
          Hey Champion! Your deep work session starts in 10 mins. Ready?
        </Text>
      </View>
      <View style={[styles.bubble, styles.bubbleTwo]}>
        <Text variant="bodyLarge" color={colors.textSecondary} style={styles.bubbleText}>
          Oh! Thank you. I’m almost there.
        </Text>
      </View>
      <View style={styles.notification}>
        <View style={styles.notificationHead}>
          <View style={styles.bell}>
            <Icon name="notifications" size={22} color={colors.primaryTint} />
          </View>
          <View style={styles.notificationBody}>
            <Text variant="label" color={colors.white}>
              Nudge Now
            </Text>
            <Text variant="body" color={colors.white}>
              Morning Rophy! Workout in 5 mins. You’re on a 7-day streak. You’re doing well.
            </Text>
          </View>
        </View>
        <Waveform heights={WAVE} color={colors.pink} barWidth={3} gap={3} maxHeight={36} />
      </View>
    </View>
  );
}

/** Slide 3: the streak badge with seven ticked days. */
export function StreakArt() {
  return (
    <View style={styles.streak}>
      <Image
        source={require('@/assets/images/onboarding-streak.png')}
        style={styles.badge}
        contentFit="contain"
      />
      <Text variant="heading" color={colors.white} style={styles.streakTitle}>
        7 Day Streak
      </Text>
      <View style={styles.days}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={styles.day}>
            <Icon name="checkmark" size={18} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alarmWrap: { flex: 1, alignItems: 'center', marginHorizontal: -20 },
  alarm: { width: '84%', aspectRatio: 805 / 1045 },
  alarmFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },

  rhythm: { flex: 1, paddingTop: 12 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  bubbleOne: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '-8deg' }],
    marginRight: 40,
  },
  bubbleTwo: {
    backgroundColor: 'rgba(237,208,255,0.75)',
    transform: [{ rotate: '6deg' }],
    marginTop: 34,
    marginLeft: 70,
    marginRight: 18,
  },
  bubbleText: { flex: 1 },
  memoji: { width: 44, height: 44, borderRadius: 22 },
  notification: {
    backgroundColor: colors.inverse,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    marginTop: 40,
    marginLeft: 22,
    transform: [{ rotate: '-7deg' }],
  },
  notificationHead: { flexDirection: 'row', gap: 12 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBody: { flex: 1, gap: 2 },

  streak: { flex: 1, alignItems: 'center' },
  badge: { width: 236, height: 260 },
  streakTitle: { marginTop: 8 },
  days: { flexDirection: 'row', gap: 10, marginTop: 18 },
  day: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
