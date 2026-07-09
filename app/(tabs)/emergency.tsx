import { useState, useCallback, useEffect } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppState, type EmergencyContact } from "@/lib/app-context";
import * as Haptics from "expo-haptics";
import {
  checkSmsConfiguration,
  sendEmergencySmsToContacts,
  sendTestSms,
} from "@/lib/emergency-sms-client";

export default function EmergencyScreen() {
  const colors = useColors();
  const { state, dispatch } = useAppState();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [alertMessage, setAlertMessage] = useState(
    state.detectionSettings.alertMessage,
  );

  // SMS config state
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);
  const [smsConfigMessage, setSmsConfigMessage] = useState<string | null>(null);
  const [smsChecking, setSmsChecking] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);

  const checkSmsConfig = useCallback(async () => {
    setSmsChecking(true);
    try {
      const result = await checkSmsConfiguration();
      setSmsConfigured(result.configured && result.valid);
      setSmsConfigMessage(result.error || result.warning || null);
    } catch {
      setSmsConfigured(false);
      setSmsConfigMessage("Impossible de verifier le service SMS.");
    } finally {
      setSmsChecking(false);
    }
  }, []);

  // Check SMS configuration on mount
  useEffect(() => {
    checkSmsConfig();
  }, [checkSmsConfig]);

  const handleAddContact = useCallback(() => {
    if (!name.trim() || !phone.trim()) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    dispatch({
      type: "ADD_CONTACT",
      payload: {
        id: Date.now().toString(),
        name: name.trim(),
        phone: phone.trim(),
        relation: relation.trim() || "Non precise",
      },
    });
    setShowAddModal(false);
    setName("");
    setPhone("");
    setRelation("");
  }, [dispatch, name, phone, relation]);

  const handleRemoveContact = useCallback(
    (id: string) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      dispatch({ type: "REMOVE_CONTACT", payload: id });
    },
    [dispatch],
  );

  const handleCallContact = useCallback((phoneNumber: string) => {
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      }
    });
  }, []);

  const handleSOS = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    if (state.emergencyContacts.length === 0) {
      if (Platform.OS === "web") {
        alert("Aucun contact d'urgence configure. Ajoutez un contact d'abord.");
      } else {
        Alert.alert(
          "Aucun contact",
          "Ajoutez au moins un contact d'urgence avant d'utiliser le bouton SOS.",
        );
      }
      return;
    }

    setSosLoading(true);

    // Call first contact
    const firstContact = state.emergencyContacts[0];
    handleCallContact(firstContact.phone);

    // Send SMS to all contacts via Twilio
    const patientName = state.medicalProfile.name || "Patient ProxiVeille";
    try {
      const result = await sendEmergencySmsToContacts(
        state.emergencyContacts.map((c) => ({ name: c.name, phone: c.phone })),
        patientName,
        {
          timestamp: Date.now(),
          intensity: "high",
          detectionSource: "manual",
        },
      );

      if (!result || result.totalSent === 0) {
        // Fallback to native SMS
        const phones = state.emergencyContacts.map((c) => c.phone).join(",");
        const message = encodeURIComponent(
          state.detectionSettings.alertMessage,
        );
        const smsUrl =
          Platform.OS === "ios"
            ? `sms:${phones}&body=${message}`
            : `sms:${phones}?body=${message}`;
        Linking.canOpenURL(smsUrl).then((supported) => {
          if (supported) Linking.openURL(smsUrl);
        });
      }
    } catch {
      // Fallback on error
      const phones = state.emergencyContacts.map((c) => c.phone).join(",");
      const message = encodeURIComponent(state.detectionSettings.alertMessage);
      const smsUrl =
        Platform.OS === "ios"
          ? `sms:${phones}&body=${message}`
          : `sms:${phones}?body=${message}`;
      Linking.canOpenURL(smsUrl).then((supported) => {
        if (supported) Linking.openURL(smsUrl);
      });
    }

    // Record the SOS event
    dispatch({
      type: "ADD_SEIZURE",
      payload: {
        id: Date.now().toString(),
        timestamp: Date.now(),
        duration: 0,
        intensity: "high",
        notes: "Alerte SOS manuelle declenchee - SMS envoyes aux contacts",
        wasManual: true,
        wasCancelled: false,
      },
    });

    setSosLoading(false);
  }, [
    state.emergencyContacts,
    state.medicalProfile.name,
    state.detectionSettings.alertMessage,
    dispatch,
    handleCallContact,
  ]);

  const handleTestSms = useCallback(async () => {
    if (state.emergencyContacts.length === 0) {
      if (Platform.OS === "web") {
        alert(
          "Ajoutez un contact d'urgence d'abord pour tester l'envoi de SMS.",
        );
      } else {
        Alert.alert(
          "Aucun contact",
          "Ajoutez un contact d'urgence pour tester l'envoi de SMS.",
        );
      }
      return;
    }

    setTestingSms(true);
    const firstContact = state.emergencyContacts[0];
    const patientName = state.medicalProfile.name || "Test ProxiVeille";

    try {
      const result = await sendTestSms(firstContact.phone, patientName);
      if (Platform.OS === "web") {
        alert(
          result.success
            ? `SMS de test envoye a ${firstContact.name} (${firstContact.phone})`
            : `Echec de l'envoi : ${result.error || "Erreur inconnue"}`,
        );
      } else {
        Alert.alert(
          result.success ? "SMS envoye" : "Echec",
          result.success
            ? `SMS de test envoye a ${firstContact.name} (${firstContact.phone})`
            : `Echec de l'envoi : ${result.error || "Erreur inconnue. Verifiez la configuration Twilio."}`,
        );
      }
    } catch (error: any) {
      if (Platform.OS === "web") {
        alert(`Erreur : ${error.message}`);
      } else {
        Alert.alert("Erreur", `Impossible d'envoyer le SMS : ${error.message}`);
      }
    } finally {
      setTestingSms(false);
    }
  }, [state.emergencyContacts, state.medicalProfile.name]);

  const handleSaveMessage = useCallback(() => {
    dispatch({
      type: "UPDATE_SETTINGS",
      payload: { alertMessage: alertMessage },
    });
    setShowMessageModal(false);
  }, [dispatch, alertMessage]);

  const renderContact = useCallback(
    ({ item }: { item: EmergencyContact }) => (
      <View className="bg-surface rounded-xl p-4 border border-border mb-3">
        <View className="flex-row justify-between items-start">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              {item.name}
            </Text>
            <Text className="text-sm text-muted mt-1">{item.relation}</Text>
            <Text className="text-sm text-primary mt-1">{item.phone}</Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => handleCallContact(item.phone)}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: colors.success + "20",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.success,
                }}
              >
                Appeler
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleRemoveContact(item.id)}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: colors.error + "15",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: colors.error }}
              >
                Suppr.
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    ),
    [colors, handleCallContact, handleRemoveContact],
  );

  return (
    <ScreenContainer className="px-6">
      {/* Header */}
      <View className="pt-4 mb-4">
        <Text className="text-2xl font-bold text-foreground">Urgence</Text>
        <Text className="text-sm text-muted mt-1">
          Contacts alertes en cas de crise
        </Text>
      </View>

      {/* SMS Configuration Status */}
      <View
        style={{
          backgroundColor: smsConfigured
            ? colors.success + "15"
            : smsConfigured === false
              ? colors.warning + "15"
              : colors.surface,
          borderRadius: 12,
          padding: 14,
          borderWidth: 1,
          borderColor: smsConfigured
            ? colors.success + "30"
            : smsConfigured === false
              ? colors.warning + "30"
              : colors.border,
          marginBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: smsConfigured
                ? colors.success
                : smsConfigured === false
                  ? colors.warning
                  : colors.muted,
            }}
          >
            {smsChecking
              ? "Verification du service SMS..."
              : smsConfigured
                ? "SMS Twilio configure"
                : "SMS Twilio non configure"}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
            {smsConfigMessage
              ? smsConfigMessage
              : smsConfigured
                ? "Les SMS seront envoyes automatiquement lors d'une crise"
                : "Les SMS utiliseront l'app native du telephone en secours"}
          </Text>
        </View>
        {smsChecking ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Pressable
            onPress={checkSmsConfig}
            style={({ pressed }) => [
              {
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.primary + "15",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}
            >
              Verifier
            </Text>
          </Pressable>
        )}
      </View>

      {/* Test SMS Button */}
      <Pressable
        onPress={handleTestSms}
        style={({ pressed }) => [
          {
            backgroundColor: colors.primary + "12",
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: colors.primary + "25",
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {testingSms ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text
            style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}
          >
            Envoyer un SMS de test
          </Text>
        )}
      </Pressable>

      {/* SOS Button */}
      <Pressable
        onPress={handleSOS}
        style={({ pressed }) => [
          {
            backgroundColor: colors.error,
            paddingVertical: 20,
            borderRadius: 16,
            alignItems: "center",
            marginBottom: 16,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
      >
        {sosLoading ? (
          <ActivityIndicator size="large" color="#FFFFFF" />
        ) : (
          <>
            <Text style={{ fontSize: 28, fontWeight: "800", color: "#FFFFFF" }}>
              SOS
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                marginTop: 4,
              }}
            >
              Appeler + envoyer SMS a tous les contacts
            </Text>
          </>
        )}
      </Pressable>

      {/* Alert Message Config */}
      <Pressable
        onPress={() => setShowMessageModal(true)}
        style={({ pressed }) => [
          {
            backgroundColor: colors.surface,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 16,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text className="text-sm font-semibold text-foreground mb-1">
          Message d'alerte
        </Text>
        <Text className="text-xs text-muted" numberOfLines={2}>
          {state.detectionSettings.alertMessage}
        </Text>
      </Pressable>

      {/* Contacts Header */}
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-lg font-semibold text-foreground">
          Contacts ({state.emergencyContacts.length})
        </Text>
        <Pressable
          onPress={() => setShowAddModal(true)}
          style={({ pressed }) => [
            {
              backgroundColor: colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 10,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
            + Ajouter
          </Text>
        </Pressable>
      </View>

      {/* Contacts List */}
      <FlatList
        data={state.emergencyContacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-base text-muted text-center">
              Aucun contact d'urgence{"\n"}Ajoutez vos proches pour etre
              alerte(s)
            </Text>
          </View>
        }
      />

      {/* Add Contact Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: colors.foreground,
                marginBottom: 20,
              }}
            >
              Ajouter un contact
            </Text>

            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.foreground,
                marginBottom: 6,
              }}
            >
              Nom *
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom du contact"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 14,
              }}
            />

            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.foreground,
                marginBottom: 6,
              }}
            >
              Telephone * (format international: +33...)
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+33612345678"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 14,
              }}
            />

            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.foreground,
                marginBottom: 6,
              }}
            >
              Relation
            </Text>
            <TextInput
              value={relation}
              onChangeText={setRelation}
              placeholder="Ex: Conjoint, Parent, Ami..."
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 20,
              }}
            />

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  setShowAddModal(false);
                  setName("");
                  setPhone("");
                  setRelation("");
                }}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontWeight: "600", color: colors.muted }}>
                  Annuler
                </Text>
              </Pressable>
              <Pressable
                onPress={handleAddContact}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor:
                      name.trim() && phone.trim()
                        ? colors.primary
                        : colors.muted,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontWeight: "600", color: "#FFFFFF" }}>
                  Ajouter
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alert Message Modal */}
      <Modal visible={showMessageModal} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: colors.foreground,
                marginBottom: 20,
              }}
            >
              Message d'alerte
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.muted,
                marginBottom: 12,
              }}
            >
              Ce message sera utilise en secours si Twilio n'est pas configure.
              Avec Twilio, un message detaille est genere automatiquement.
            </Text>
            <TextInput
              value={alertMessage}
              onChangeText={setAlertMessage}
              multiline
              numberOfLines={4}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                minHeight: 100,
                textAlignVertical: "top",
                marginBottom: 20,
              }}
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setShowMessageModal(false)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontWeight: "600", color: colors.muted }}>
                  Annuler
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveMessage}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontWeight: "600", color: "#FFFFFF" }}>
                  Sauvegarder
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
