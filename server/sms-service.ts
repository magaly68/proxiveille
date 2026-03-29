import Twilio from "twilio";

// Twilio SMS Service for EpiGuard
// Sends emergency SMS alerts to contacts when a seizure is detected

interface SendSmsParams {
  to: string; // Phone number in E.164 format (e.g., +33612345678)
  body: string;
}

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SendBulkSmsParams {
  recipients: Array<{ name: string; phone: string }>;
  patientName: string;
  seizureInfo: {
    timestamp: number;
    intensity: "low" | "medium" | "high";
    duration?: number;
    detectionSource?: string;
  };
  location?: string;
}

interface BulkSmsResult {
  totalSent: number;
  totalFailed: number;
  results: Array<{
    name: string;
    phone: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
    );
  }

  return new Twilio.Twilio(accountSid, authToken);
}

function getTwilioPhoneNumber(): string {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error(
      "Twilio phone number not configured. Please set TWILIO_PHONE_NUMBER."
    );
  }
  return phoneNumber;
}

/**
 * Send a single SMS via Twilio
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  try {
    const client = getTwilioClient();
    const from = getTwilioPhoneNumber();

    const message = await client.messages.create({
      body: params.body,
      from,
      to: params.to,
    });

    console.log(`[SMS] Message sent to ${params.to}: ${message.sid}`);
    return {
      success: true,
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error(`[SMS] Failed to send to ${params.to}:`, error.message);
    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}

/**
 * Format the intensity label in French
 */
function formatIntensity(intensity: "low" | "medium" | "high"): string {
  switch (intensity) {
    case "low":
      return "faible";
    case "medium":
      return "moyenne";
    case "high":
      return "elevee";
  }
}

/**
 * Format the emergency SMS body
 */
function formatEmergencySms(
  patientName: string,
  seizureInfo: SendBulkSmsParams["seizureInfo"],
  location?: string
): string {
  const date = new Date(seizureInfo.timestamp);
  const timeStr = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString("fr-FR");

  let message = `ALERTE EPIGUARD - Crise d'epilepsie detectee !\n\n`;
  message += `Patient : ${patientName || "Non renseigne"}\n`;
  message += `Date : ${dateStr} a ${timeStr}\n`;
  message += `Intensite : ${formatIntensity(seizureInfo.intensity)}\n`;

  if (seizureInfo.duration) {
    message += `Duree estimee : ${seizureInfo.duration}s\n`;
  }

  if (seizureInfo.detectionSource) {
    const sourceLabel =
      seizureInfo.detectionSource === "combined"
        ? "telephone + montre"
        : seizureInfo.detectionSource === "watch"
          ? "montre connectee"
          : "telephone";
    message += `Source : ${sourceLabel}\n`;
  }

  if (location) {
    message += `Localisation : ${location}\n`;
  }

  message += `\nVeuillez contacter ${patientName || "le patient"} ou les services d'urgence si necessaire.`;
  message += `\n\n-- Envoye par EpiGuard`;

  return message;
}

/**
 * Send emergency SMS to all contacts
 */
export async function sendBulkEmergencySms(
  params: SendBulkSmsParams
): Promise<BulkSmsResult> {
  const { recipients, patientName, seizureInfo, location } = params;

  const body = formatEmergencySms(patientName, seizureInfo, location);

  const results = await Promise.allSettled(
    recipients.map(async (recipient) => {
      const result = await sendSms({
        to: recipient.phone,
        body,
      });
      return {
        name: recipient.name,
        phone: recipient.phone,
        ...result,
      };
    })
  );

  const processedResults = results.map((r) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    return {
      name: "Unknown",
      phone: "Unknown",
      success: false,
      error: r.reason?.message || "Promise rejected",
    };
  });

  const totalSent = processedResults.filter((r) => r.success).length;
  const totalFailed = processedResults.filter((r) => !r.success).length;

  console.log(
    `[SMS] Bulk send complete: ${totalSent} sent, ${totalFailed} failed`
  );

  return {
    totalSent,
    totalFailed,
    results: processedResults,
  };
}

/**
 * Verify that Twilio credentials are configured and valid
 */
export async function verifyTwilioConfig(): Promise<{
  configured: boolean;
  valid: boolean;
  error?: string;
}> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    return {
      configured: false,
      valid: false,
      error: "Missing Twilio environment variables",
    };
  }

  try {
    const client = new Twilio.Twilio(accountSid, authToken);
    // Verify account by fetching account info
    const account = await client.api.accounts(accountSid).fetch();
    return {
      configured: true,
      valid: account.status === "active",
    };
  } catch (error: any) {
    return {
      configured: true,
      valid: false,
      error: error.message || "Invalid credentials",
    };
  }
}
