import { useCallback, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useAppState } from "@/lib/app-context";
import {
  openNativeEmergencySms,
  sendEmergencySmsToContacts,
} from "@/lib/emergency-sms-client";
import { FEATURES } from "@/shared/const";

function callNumber(phoneNumber: string) {
  const url = `tel:${phoneNumber}`;
  Linking.canOpenURL(url).then((supported) => {
    if (supported) Linking.openURL(url);
  });
}

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Alerte SOS manuelle, partagee entre l'accueil et l'ecran Urgence.
 *
 * Mode par defaut (FEATURES.serverSms = false) :
 *   1. ouvre l'app SMS native avec le message d'alerte + la position GPS,
 *      adresse a tous les contacts (l'utilisateur appuie sur "Envoyer") ;
 *   2. au retour dans l'app, propose d'appeler le premier contact ou le 15.
 * Aucune donnee ne passe par un serveur.
 */
export function useSos() {
  const { state, dispatch } = useAppState();
  const [sosLoading, setSosLoading] = useState(false);

  const triggerSos = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    const contacts = state.emergencyContacts.filter((c) => c.phone && c.phone.trim().length > 0);
    if (contacts.length === 0) {
      notify(
        "Aucun contact",
        "Ajoutez au moins un contact d'urgence (onglet Urgence) avant d'utiliser le bouton SOS."
      );
      return;
    }

    setSosLoading(true);
    const now = Date.now();
    const message = state.detectionSettings.alertMessage;
    let smsOpened = false;
    let serverSent = 0;
    let serverFailed = 0;

    try {
      if (FEATURES.serverSms) {
        callNumber(contacts[0].phone);
        const result = await sendEmergencySmsToContacts(
          contacts.map((c) => ({ name: c.name, phone: c.phone })),
          state.medicalProfile.name || "Utilisateur ProxiVeille",
          { timestamp: now, intensity: "high", detectionSource: "manual" }
        );
        if (result && result.totalSent > 0) {
          serverSent = result.totalSent;
          serverFailed = result.totalFailed;
        } else {
          smsOpened = await openNativeEmergencySms(contacts.map((c) => c.phone), message);
        }
      } else {
        smsOpened = await openNativeEmergencySms(contacts.map((c) => c.phone), message);
      }
    } finally {
      setSosLoading(false);
    }

    const serverMode = serverSent > 0;
    dispatch({
      type: "ADD_ALERT_HISTORY",
      payload: {
        id: `sos-${now}`,
        timestamp: now,
        type: "sos",
        triggeredBy: "sos_manual",
        message,
        recipients: contacts.map((c) => ({
          name: c.name,
          phone: c.phone,
          // En mode SMS natif, on ne sait pas si l'utilisateur a appuye sur "Envoyer".
          status: serverMode ? "sent" : smsOpened ? "pending" : "failed",
        })),
        totalSent: serverSent,
        totalFailed: serverMode ? serverFailed : smsOpened ? 0 : contacts.length,
      },
    });

    dispatch({
      type: "ADD_SEIZURE",
      payload: {
        id: now.toString(),
        timestamp: now,
        duration: 0,
        intensity: "high",
        notes: serverMode
          ? "Alerte SOS manuelle - SMS envoyes aux contacts"
          : "Alerte SOS manuelle - SMS prepare pour les contacts",
        wasManual: true,
        wasCancelled: false,
      },
    });

    if (serverMode) return;

    if (!smsOpened) {
      notify(
        "SMS impossible",
        "L'application SMS n'a pas pu s'ouvrir. Appelez directement un proche ou le 15."
      );
    }

    // Propose l'appel (s'affiche au retour dans l'app apres l'envoi du SMS).
    if (Platform.OS === "web") return;
    const first = contacts[0];
    Alert.alert("Appeler quelqu'un ?", "Le SMS d'alerte est pret. Voulez-vous aussi appeler ?", [
      { text: `Appeler ${first.name}`, onPress: () => callNumber(first.phone) },
      { text: "Appeler le 15 (SAMU)", onPress: () => callNumber("15") },
      { text: "Non merci", style: "cancel" },
    ]);
  }, [state.emergencyContacts, state.detectionSettings.alertMessage, state.medicalProfile.name, dispatch]);

  return { triggerSos, sosLoading };
}
