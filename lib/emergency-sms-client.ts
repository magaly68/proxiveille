import { Linking, Platform } from "react-native";
import { FEATURES } from "@/shared/const";
import { getApiBaseUrl } from "@/constants/oauth";
import {
  sendSmsSentNotification,
  sendSmsNotConfiguredNotification,
  sendEmergencyContactsAlertedNotification,
} from "./notification-service";
import { getEmergencyLocation, getQuickLocation } from "./location-service";

interface EmergencyContact {
  name: string;
  phone: string;
}

interface SeizureInfo {
  timestamp: number;
  intensity: "low" | "medium" | "high";
  duration?: number;
  detectionSource?: string;
}

interface SmsResult {
  totalSent: number;
  totalFailed: number;
  results: Array<{
    name: string;
    phone: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Send emergency SMS to all contacts via the backend API
 * Automatically includes GPS location if available.
 * Falls back to local phone dialer if the backend is unavailable.
 */
export async function sendEmergencySmsToContacts(
  contacts: EmergencyContact[],
  patientName: string,
  seizureInfo: SeizureInfo,
  location?: string
): Promise<SmsResult | null> {
  // SMS serveur (Twilio) desactive : l'appelant passe par openNativeEmergencySms.
  if (!FEATURES.serverSms) return null;

  const apiBaseUrl = getApiBaseUrl();

  // Filter contacts that have phone numbers
  const validContacts = contacts.filter(
    (c) => c.phone && c.phone.trim().length > 0
  );

  if (validContacts.length === 0) {
    console.warn("[EmergencySMS] No contacts with phone numbers");
    return null;
  }

  // Automatically get GPS location if not provided
  let locationText = location;
  if (!locationText) {
    try {
      const gpsResult = await getEmergencyLocation();
      if (gpsResult.location) {
        // Build a rich location string with address + Google Maps link
        const parts: string[] = [];
        if (gpsResult.address) {
          parts.push(gpsResult.address);
        }
        if (gpsResult.googleMapsUrl) {
          parts.push(gpsResult.googleMapsUrl);
        }
        locationText = parts.join(" - ") || gpsResult.smsText;
        console.log(`[EmergencySMS] GPS location obtained: ${locationText}`);
      } else {
        console.warn(`[EmergencySMS] GPS unavailable: ${gpsResult.smsText}`);
      }
    } catch (gpsError: any) {
      console.warn("[EmergencySMS] Failed to get GPS:", gpsError.message);
    }
  }

  if (!apiBaseUrl) {
    console.warn("[EmergencySMS] API base URL is not configured for this build");
    if (Platform.OS !== "web") {
      await sendSmsNotConfiguredNotification();
    }
    return null;
  }

  try {
    // Call the backend API to send SMS via Twilio
    const response = await fetch(`${apiBaseUrl}/api/trpc/emergency.sendEmergencySms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          recipients: validContacts.map((c) => ({
            name: c.name,
            phone: c.phone,
          })),
          patientName,
          seizureInfo: {
            timestamp: seizureInfo.timestamp,
            intensity: seizureInfo.intensity,
            duration: seizureInfo.duration,
            detectionSource: seizureInfo.detectionSource,
          },
          location: locationText,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const result: SmsResult = data.result?.data?.json || data.result?.data || data;

    // Send local notification about SMS status
    if (Platform.OS !== "web") {
      await sendSmsSentNotification(result.totalSent, result.totalFailed);
    }

    console.log(
      `[EmergencySMS] Sent: ${result.totalSent}, Failed: ${result.totalFailed}`
    );
    return result;
  } catch (error: any) {
    console.error("[EmergencySMS] Failed to send via API:", error.message);

    // Send notification that SMS is not configured
    if (Platform.OS !== "web") {
      await sendSmsNotConfiguredNotification();
    }

    return null;
  }
}

/**
 * Check if the SMS service is configured on the backend
 */
export async function checkSmsConfiguration(): Promise<{
  configured: boolean;
  valid: boolean;
  error?: string;
  warning?: string;
  accountStatus?: string;
  senderNumber?: string;
  senderSmsCapable?: boolean;
  isTrial?: boolean;
}> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return {
      configured: false,
      valid: false,
      error: "API backend non configuree pour cette build Android",
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/trpc/emergency.checkSmsConfig`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.result?.data?.json || data.result?.data || { configured: false, valid: false };
  } catch (error: any) {
    console.warn("[EmergencySMS] Cannot check config:", error.message);
    return {
      configured: false,
      valid: false,
      error: "Backend unavailable",
    };
  }
}

/**
 * Send a test SMS to verify the configuration
 */
export async function sendTestSms(
  phoneNumber: string,
  patientName?: string
): Promise<{ success: boolean; error?: string }> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return {
      success: false,
      error: "API backend non configuree pour cette build Android",
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/trpc/emergency.sendTestSms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          to: phoneNumber,
          patientName,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result?.data?.json || data.result?.data || { success: false };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to send test SMS",
    };
  }
}

const NATIVE_SMS_GPS_TIMEOUT_MS = 8000;

/**
 * Ouvre l'app SMS native avec le message d'alerte pre-rempli et, si possible,
 * un lien Google Maps vers la position actuelle.
 * Aucune donnee n'est envoyee a un serveur : l'utilisateur appuie sur "Envoyer".
 * La recherche GPS est limitee a quelques secondes pour ne pas retarder l'alerte.
 */
export async function openNativeEmergencySms(
  phones: string[],
  baseMessage: string
): Promise<boolean> {
  const validPhones = phones.map((p) => p.trim()).filter((p) => p.length > 0);
  if (validPhones.length === 0) return false;

  let message = baseMessage;
  try {
    const gps = await Promise.race([
      getQuickLocation(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), NATIVE_SMS_GPS_TIMEOUT_MS)),
    ]);
    if (gps && gps.success && gps.googleMapsUrl) {
      message = `${baseMessage}\nMa position : ${gps.googleMapsUrl}`;
    }
  } catch {
    // La position est optionnelle : on envoie le message sans elle.
  }

  const recipients = validPhones.join(",");
  const body = encodeURIComponent(message);
  const smsUrl =
    Platform.OS === "ios" ? `sms:${recipients}&body=${body}` : `sms:${recipients}?body=${body}`;

  try {
    const supported = await Linking.canOpenURL(smsUrl);
    if (!supported) return false;
    await Linking.openURL(smsUrl);
    return true;
  } catch {
    return false;
  }
}
