import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { MedicationReminder } from "./app-context";

const MEDICATION_CHANNEL_ID = "medication-reminders";

/**
 * Set up the Android notification channel for medication reminders
 */
export async function setupMedicationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
    name: "Rappels de traitement",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 100, 300],
    sound: "default",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Schedule all recurring notifications for a medication reminder.
 * Returns the list of scheduled notification IDs.
 */
export async function scheduleMedicationNotifications(
  reminder: MedicationReminder
): Promise<string[]> {
  if (Platform.OS === "web" || !reminder.enabled) return [];

  const ids: string[] = [];

  for (const time of reminder.times) {
    const [hourStr, minuteStr] = time.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (isNaN(hour) || isNaN(minute)) continue;

    if (reminder.daysOfWeek.length === 0) {
      // Every day
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Rappel : ${reminder.medicationName}`,
          body: reminder.dosage
            ? `Prenez ${reminder.dosage} de ${reminder.medicationName}`
            : `Heure de prendre ${reminder.medicationName}`,
          data: {
            type: "medication_reminder",
            reminderId: reminder.id,
            scheduledTime: time,
            medicationName: reminder.medicationName,
          },
          sound: "default",
          ...(Platform.OS === "android" ? { channelId: MEDICATION_CHANNEL_ID } : {}),
        },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
          },
      });
      ids.push(id);
    } else {
      // Specific days of week
      for (const dayOfWeek of reminder.daysOfWeek) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Rappel : ${reminder.medicationName}`,
            body: reminder.dosage
              ? `Prenez ${reminder.dosage} de ${reminder.medicationName}`
              : `Heure de prendre ${reminder.medicationName}`,
            data: {
              type: "medication_reminder",
              reminderId: reminder.id,
              scheduledTime: time,
              medicationName: reminder.medicationName,
            },
            sound: "default",
            ...(Platform.OS === "android" ? { channelId: MEDICATION_CHANNEL_ID } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: dayOfWeek + 1, // Expo uses 1=Sun … 7=Sat
            hour,
            minute,
          },
        });
        ids.push(id);
      }
    }
  }

  return ids;
}

/**
 * Cancel all scheduled notifications for a reminder
 */
export async function cancelMedicationNotifications(notificationIds: string[]): Promise<void> {
  if (Platform.OS === "web") return;
  for (const id of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Notification may already be dismissed
    }
  }
}

/**
 * Re-schedule notifications for a reminder (cancel old ones, schedule new ones)
 */
export async function rescheduleMedicationNotifications(
  reminder: MedicationReminder
): Promise<string[]> {
  await cancelMedicationNotifications(reminder.notificationIds);
  if (!reminder.enabled) return [];
  return scheduleMedicationNotifications(reminder);
}

/**
 * Get the day name in French
 */
export function getDayName(dayIndex: number): string {
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return days[dayIndex] ?? "";
}

/**
 * Get a human-readable schedule description
 */
export function getScheduleDescription(reminder: MedicationReminder): string {
  const timesStr = reminder.times.join(", ");
  if (reminder.daysOfWeek.length === 0) {
    return `Tous les jours à ${timesStr}`;
  }
  const daysStr = reminder.daysOfWeek.map(getDayName).join(", ");
  return `${daysStr} à ${timesStr}`;
}

/**
 * Medication colour palette for visual distinction
 */
export const MEDICATION_COLORS = [
  "#6C5CE7", // violet (primary)
  "#00B894", // green
  "#E17055", // orange
  "#0984E3", // blue
  "#FDCB6E", // yellow
  "#D63031", // red
  "#A29BFE", // lavender
  "#55EFC4", // mint
];

/**
 * Get today's date as "YYYY-MM-DD"
 */
export function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Get current time as "HH:MM"
 */
export function getCurrentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
