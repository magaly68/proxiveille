export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/**
 * Feature flags.
 *
 * autoDetection: detection automatique des crises (accelerometre, gyroscope,
 *   montre BLE), surveillance en arriere-plan, appel automatique et mode nuit.
 *   Desactivee pour la version publique : l'app se limite a l'alerte manuelle,
 *   au journal et au suivi du traitement. Le code est conserve pour plus tard.
 * serverSms: envoi des SMS par le serveur (Twilio). Desactive : les SMS passent
 *   par l'app SMS native du telephone, aucune donnee ne transite par un serveur.
 */
export const FEATURES = {
  autoDetection: false,
  serverSms: false,
} as const;

export const APP_DISPLAY_NAME = "ProxiVeille";
