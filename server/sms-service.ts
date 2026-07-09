import Twilio from "twilio";

// Twilio SMS Service for ProxiVeille
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

export interface SmsConfigResult {
  configured: boolean;
  valid: boolean;
  error?: string;
  warning?: string;
  accountStatus?: string;
  senderNumber?: string;
  senderSmsCapable?: boolean;
  isTrial?: boolean;
}

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizePhoneNumber(rawPhoneNumber: string): string | null {
  const trimmed = rawPhoneNumber.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed
    .replace(/\(0\)/g, "")
    .replace(/[\s().-]/g, "")
    .replace(/^00/, "+");

  const plusCount = (sanitized.match(/\+/g) ?? []).length;
  if (plusCount > 1 || !sanitized.startsWith("+")) {
    return null;
  }

  return E164_PHONE_REGEX.test(sanitized) ? sanitized : null;
}

function getPhoneFormatError(label: string): string {
  return `${label} doit etre au format international E.164, par exemple +33612345678.`;
}

function formatTwilioError(error: any): string {
  const code = typeof error?.code === "number" ? error.code : undefined;
  const baseMessage = error?.message || "Unknown error";

  switch (code) {
    case 21211:
      return `Numero invalide. ${getPhoneFormatError("Le numero destinataire")} (Twilio ${code}).`;
    case 21608:
      return `Le numero destinataire n'est pas verifie dans votre compte Twilio d'essai (Twilio ${code}).`;
    case 21606:
      return `Le numero Twilio configure ne peut pas envoyer de SMS vers cette destination (Twilio ${code}).`;
    case 21408:
      return `Les SMS vers ce pays ou cette region ne sont pas actives sur votre compte Twilio (Twilio ${code}).`;
    case 21610:
      return `Le destinataire a repondu STOP ou ne souhaite plus recevoir de SMS (Twilio ${code}).`;
    case 63038:
      return `Le compte Twilio d'essai a depasse sa limite quotidienne de messages (Twilio ${code}).`;
    default:
      return code ? `${baseMessage} (Twilio ${code})` : baseMessage;
  }
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  return new Twilio.Twilio(accountSid, authToken);
}

function getTwilioPhoneNumber(): string {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error(
      "Twilio phone number not configured. Please set TWILIO_PHONE_NUMBER.",
    );
  }

  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhoneNumber) {
    throw new Error(getPhoneFormatError("TWILIO_PHONE_NUMBER"));
  }

  return normalizedPhoneNumber;
}

/**
 * Send a single SMS via Twilio
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  try {
    const client = getTwilioClient();
    const from = getTwilioPhoneNumber();
    const normalizedTo = normalizePhoneNumber(params.to);

    if (!normalizedTo) {
      return {
        success: false,
        error: getPhoneFormatError("Le numero destinataire"),
      };
    }

    const message = await client.messages.create({
      body: params.body,
      from,
      to: normalizedTo,
    });

    console.log(`[SMS] Message sent to ${normalizedTo}: ${message.sid}`);
    return {
      success: true,
      messageId: message.sid,
    };
  } catch (error: any) {
    const formattedError = formatTwilioError(error);
    console.error(`[SMS] Failed to send to ${params.to}:`, formattedError);
    return {
      success: false,
      error: formattedError,
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
  location?: string,
): string {
  const date = new Date(seizureInfo.timestamp);
  const timeStr = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString("fr-FR");

  let message = `ALERTE PROXIVEILLE - Crise d'epilepsie detectee !\n\n`;
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
  message += `\n\n-- Envoye par ProxiVeille`;

  return message;
}

/**
 * Send emergency SMS to all contacts
 */
export async function sendBulkEmergencySms(
  params: SendBulkSmsParams,
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
    }),
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
    `[SMS] Bulk send complete: ${totalSent} sent, ${totalFailed} failed`,
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
export async function verifyTwilioConfig(): Promise<SmsConfigResult> {
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

  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhoneNumber) {
    return {
      configured: true,
      valid: false,
      error: getPhoneFormatError("TWILIO_PHONE_NUMBER"),
    };
  }

  try {
    const client = new Twilio.Twilio(accountSid, authToken);
    // Verify account by fetching account info
    const account = await client.api.accounts(accountSid).fetch();
    const incomingNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: normalizedPhoneNumber,
      limit: 1,
    });
    const senderNumber = incomingNumbers[0] as any;
    const senderSmsCapable = Boolean(
      senderNumber?.capabilities?.SMS ?? senderNumber?.capabilities?.sms,
    );
    const isTrial = String((account as any)?.type ?? "")
      .toLowerCase()
      .includes("trial");

    if (!senderNumber) {
      return {
        configured: true,
        valid: false,
        error: "Le numero Twilio configure n'existe pas dans ce compte Twilio.",
        accountStatus: account.status,
        senderNumber: normalizedPhoneNumber,
        isTrial,
      };
    }

    if (!senderSmsCapable) {
      return {
        configured: true,
        valid: false,
        error: "Le numero Twilio configure n'est pas compatible SMS.",
        accountStatus: account.status,
        senderNumber: normalizedPhoneNumber,
        senderSmsCapable,
        isTrial,
      };
    }

    return {
      configured: true,
      valid: account.status === "active",
      warning: isTrial
        ? "Compte Twilio d'essai detecte: les SMS ne partent que vers des numeros verifies dans la console Twilio."
        : undefined,
      accountStatus: account.status,
      senderNumber: normalizedPhoneNumber,
      senderSmsCapable,
      isTrial,
    };
  } catch (error: any) {
    return {
      configured: true,
      valid: false,
      error: formatTwilioError(error),
      senderNumber: normalizedPhoneNumber,
    };
  }
}
