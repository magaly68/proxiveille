import { Platform, AppState as RNAppState } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  sendSeizureAlertNotification,
  sendCountdownNotification,
  sendMonitoringActiveNotification,
  dismissMonitoringNotification,
  sendBackgroundStatusNotification,
  sendEmergencyContactsAlertedNotification,
} from "./notification-service";

const BACKGROUND_DETECTION_TASK = "epiguard-background-detection";
const MONITORING_STATE_KEY = "@epiguard_monitoring_active";
const MONITORING_NOTIFICATION_KEY = "@epiguard_monitoring_notification_id";

/**
 * Define the background task in global scope.
 * This must be called at the top level of the app (outside React components).
 */
export function defineBackgroundDetectionTask() {
  if (Platform.OS === "web") return;

  if (!TaskManager.isTaskDefined(BACKGROUND_DETECTION_TASK)) {
    TaskManager.defineTask(BACKGROUND_DETECTION_TASK, async ({ data, error }) => {
      if (error) {
        console.error("Background detection task error:", error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }

      try {
        // Check if monitoring is still active
        const isActive = await AsyncStorage.getItem(MONITORING_STATE_KEY);
        if (isActive !== "true") {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // The background task runs periodically to confirm monitoring is alive.
        // On native devices, the accelerometer subscription persists in the foreground service.
        // This task serves as a heartbeat to ensure the monitoring notification stays active
        // and to re-alert if the app was killed and restarted by the system.
        console.log(
          `[EpiGuard] Background detection heartbeat at ${new Date().toISOString()}`
        );

        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (e) {
        console.error("Background detection error:", e);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  }
}

/**
 * Register the background detection task
 */
export async function registerBackgroundDetection(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DETECTION_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_DETECTION_TASK, {
        minimumInterval: 60, // 1 minute minimum (OS may delay further)
        stopOnTerminate: false, // Continue after app is closed (Android)
        startOnBoot: true, // Restart after device reboot (Android)
      });
    }

    // Persist monitoring state
    await AsyncStorage.setItem(MONITORING_STATE_KEY, "true");

    // Show persistent monitoring notification
    const notifId = await sendMonitoringActiveNotification();
    await AsyncStorage.setItem(MONITORING_NOTIFICATION_KEY, notifId);

    return true;
  } catch (e) {
    console.error("Failed to register background detection:", e);
    return false;
  }
}

/**
 * Unregister the background detection task
 */
export async function unregisterBackgroundDetection(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DETECTION_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_DETECTION_TASK);
    }

    // Clear monitoring state
    await AsyncStorage.setItem(MONITORING_STATE_KEY, "false");

    // Dismiss persistent notification
    const notifId = await AsyncStorage.getItem(MONITORING_NOTIFICATION_KEY);
    if (notifId) {
      await dismissMonitoringNotification(notifId);
      await AsyncStorage.removeItem(MONITORING_NOTIFICATION_KEY);
    }
  } catch (e) {
    console.error("Failed to unregister background detection:", e);
  }
}

/**
 * Check if background detection is currently registered
 */
export async function isBackgroundDetectionRegistered(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_DETECTION_TASK);
  } catch {
    return false;
  }
}

/**
 * Check if monitoring was active before app restart (for auto-resume)
 */
export async function wasMonitoringActive(): Promise<boolean> {
  try {
    const state = await AsyncStorage.getItem(MONITORING_STATE_KEY);
    return state === "true";
  } catch {
    return false;
  }
}

/**
 * Handle app state changes for background transition notifications
 */
export function setupAppStateListener(isMonitoring: boolean) {
  if (Platform.OS === "web") return () => {};

  const subscription = RNAppState.addEventListener("change", async (nextAppState) => {
    if (nextAppState === "background" && isMonitoring) {
      await sendBackgroundStatusNotification();
    }
  });

  return () => subscription.remove();
}

export { BACKGROUND_DETECTION_TASK };
