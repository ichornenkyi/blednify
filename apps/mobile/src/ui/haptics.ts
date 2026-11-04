import * as Haptics from 'expo-haptics';

const swallow = () => {};

/** Fire-and-forget haptic helpers — never block UI on the haptics promise. */
export const haptics = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(swallow),
  press: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(swallow),
  select: () => void Haptics.selectionAsync().catch(swallow),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(swallow),
  warn: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(swallow),
};
