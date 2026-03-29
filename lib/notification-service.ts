import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

// Expo Push Notification token
let expoPushToken: string | null = null;

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions and set up Android channels
 */
export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Create Android notification channels
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("seizure-alerts", {
      name: "Alertes de crises",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: "#FF1744",
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });

    await Notifications.setNotificationChannelAsync("monitoring", {
      name: "Surveillance active",
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync("general", {
      name: "General",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

/**
 * Send a seizure alert notification (high priority)
 */
export async function sendSeizureAlertNotification(): Promise<void> {
  if (Platform.OS === "web") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Crise detectee !",
      body: "EpiGuard a detecte une activite anormale. Les contacts d'urgence vont etre alertes.",
      data: { type: "seizure_alert" },
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      ...(Platform.OS === "android" ? { channelId: "seizure-alerts" } : {}),
    },
    trigger: null, // Send immediately
  });
}

/**
 * Send a countdown notification (crisis detected, waiting for user response)
 */
export async function sendCountdownNotification(seconds: number): Promise<void> {
  if (Platform.OS === "web") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Crise potentielle detectee",
      body: `Alerte dans ${seconds} secondes. Ouvrez l'app pour annuler si c'est une fausse alerte.`,
      data: { type: "countdown" },
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH,
      ...(Platform.OS === "android" ? { channelId: "seizure-alerts" } : {}),
    },
    trigger: null,
  });
}

/**
 * Send a monitoring active notification (persistent, low priority)
 */
export async function sendMonitoringActiveNotification(): Promise<string> {
  if (Platform.OS === "web") return "";

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "EpiGuard - Surveillance active",
      body: "La surveillance des crises est en cours. Votre securite est assuree.",
      data: { type: "monitoring_active" },
      sticky: true,
      ...(Platform.OS === "android" ? { channelId: "monitoring" } : {}),
    },
    trigger: null,
  });

  return id;
}

/**
 * Dismiss the monitoring notification
 */
export async function dismissMonitoringNotification(notificationId: string): Promise<void> {
  if (Platform.OS === "web" || !notificationId) return;
  await Notifications.dismissNotificationAsync(notificationId);
}

/**
 * Send a false alarm notification
 */
export async function sendFalseAlarmNotification(): Promise<void> {
  if (Platform.OS === "web") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Fausse alerte annulee",
      body: "L'alerte a ete annulee. La surveillance continue.",
      data: { type: "false_alarm" },
      ...(Platform.OS === "android" ? { channelId: "general" } : {}),
    },
    trigger: null,
  });
}

/**
 * Send an emergency contacts alerted notification
 */
export async function sendEmergencyContactsAlertedNotification(contactCount: number): Promise<void> {
  if (Platform.OS === "web") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Contacts d'urgence alertes",
      body: `${contactCount} contact(s) d'urgence ont ete prevenu(s) de la crise.`,
      data: { type: "contacts_alerted" },
      sound: "default",
      ...(Platform.OS === "android" ? { channelId: "seizure-alerts" } : {}),
    },
    trigger: null,
  });
}

/**
 * Send a background monitoring status notification
 */
export async function sendBackgroundStatusNotification(): Promise<void> {
  if (Platform.OS === "web") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Surveillance en arriere-plan",
      body: "EpiGuard continue de surveiller en arriere-plan. Vous serez alerte en cas de crise.",
      data: { type: "background_status" },
      ...(Platform.OS === "android" ? { channelId: "monitoring" } : {}),
    },
    trigger: null,
  });
}

/**
 * Get the Expo Push Notification token for this device
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (expoPushToken) return expoPushToken;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    expoPushToken = tokenData.data;
    console.log("[Push] Expo push token:", expoPushToken);
    return expoPushToken;
  } catch (error: any) {
    console.warn("[Push] Failed to get push token:", error.message);
    return null;
  }
}

/**
 * Send an SMS sent confirmation notification
 */
export async function sendSmsSentNotification(
  totalSent: number,
  totalFailed: number
): Promise<void> {
  if (Platform.OS === "web") return;

  const body =
    totalFailed > 0
      ? `${totalSent} SMS envoye(s), ${totalFailed} echec(s). Verifiez la configuration Twilio.`
      : `${totalSent} SMS d'urgence envoye(s) avec succes a vos contacts.`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: totalFailed > 0 ? "SMS partiellement envoyes" : "SMS d'urgence envoyes",
      body,
      data: { type: "sms_sent" },
      sound: "default",
      ...(Platform.OS === "android" ? { channelId: "seizure-alerts" } : {}),
    },
    trigger: null,
  });
}

/**
 * Send a notification when SMS service is not configured
 */
export async function sendSmsNotConfiguredNotification(): Promise<void> {
  if (Platform.OS === "web") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "SMS non configure",
      body: "Les SMS d'urgence ne sont pas configures. Allez dans Urgence > Parametres pour configurer Twilio.",
      data: { type: "sms_not_configured" },
      ...(Platform.OS === "android" ? { channelId: "general" } : {}),
    },
    trigger: null,
  });
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Add a listener for notification responses (when user taps a notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add a listener for received notifications
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}
