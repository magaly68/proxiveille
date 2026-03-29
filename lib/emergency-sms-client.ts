import { Platform } from "react-native";
import {
  sendSmsSentNotification,
  sendSmsNotConfiguredNotification,
  sendEmergencyContactsAlertedNotification,
} from "./notification-service";
import { getEmergencyLocation } from "./location-service";

// API base URL for the backend
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000";

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

  try {
    // Call the backend API to send SMS via Twilio
    const response = await fetch(`${API_BASE_URL}/api/trpc/emergency.sendEmergencySms`, {
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
}> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/trpc/emergency.checkSmsConfig`,
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
  try {
    const response = await fetch(`${API_BASE_URL}/api/trpc/emergency.sendTestSms`, {
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
