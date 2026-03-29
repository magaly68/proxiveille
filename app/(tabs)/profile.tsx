import { useState, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Switch,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import * as Haptics from "expo-haptics";

type Section = "personal" | "medical" | "detection" | "preferences";

export default function ProfileScreen() {
  const colors = useColors();
  const { state, dispatch } = useAppState();
  const [expandedSection, setExpandedSection] = useState<Section | null>(null);

  const profile = state.medicalProfile;
  const settings = state.detectionSettings;

  const toggleSection = useCallback(
    (section: Section) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setExpandedSection((prev) => (prev === section ? null : section));
    },
    []
  );

  const updateProfile = useCallback(
    (field: string, value: string) => {
      dispatch({ type: "UPDATE_PROFILE", payload: { [field]: value } });
    },
    [dispatch]
  );

  const updateSettings = useCallback(
    (field: string, value: any) => {
      dispatch({ type: "UPDATE_SETTINGS", payload: { [field]: value } });
    },
    [dispatch]
  );

  const renderField = (label: string, field: string, value: string, placeholder: string, keyboardType?: any) => (
    <View className="mb-3">
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={(text) => updateProfile(field, text)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        style={{
          backgroundColor: colors.surface,
          borderRadius: 10,
          padding: 12,
          fontSize: 14,
          color: colors.foreground,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />
    </View>
  );

  const renderSectionHeader = (section: Section, title: string, subtitle: string) => (
    <Pressable
      onPress={() => toggleSection(section)}
      style={({ pressed }) => [
        {
          backgroundColor: colors.surface,
          padding: 16,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: expandedSection === section ? colors.primary : colors.border,
          marginBottom: expandedSection === section ? 0 : 12,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">{title}</Text>
          <Text className="text-xs text-muted mt-1">{subtitle}</Text>
        </View>
        <Text style={{ fontSize: 18, color: colors.muted }}>
          {expandedSection === section ? "−" : "+"}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer className="px-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Header */}
        <View className="pt-4 mb-6">
          <Text className="text-2xl font-bold text-foreground">Profil medical</Text>
          <Text className="text-sm text-muted mt-1">
            Informations et parametres
          </Text>
        </View>

        {/* Personal Info Section */}
        {renderSectionHeader("personal", "Informations personnelles", "Nom, age, groupe sanguin")}
        {expandedSection === "personal" && (
          <View
            style={{
              backgroundColor: colors.background,
              padding: 16,
              borderWidth: 1,
              borderTopWidth: 0,
              borderColor: colors.primary,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              marginBottom: 12,
            }}
          >
            {renderField("Nom complet", "name", profile.name, "Votre nom")}
            {renderField("Age", "age", profile.age, "Votre age", "numeric")}
            {renderField("Groupe sanguin", "bloodType", profile.bloodType, "Ex: A+, O-, AB+...")}
          </View>
        )}

        {/* Medical Info Section */}
        {renderSectionHeader("medical", "Informations medicales", "Epilepsie, traitements, allergies")}
        {expandedSection === "medical" && (
          <View
            style={{
              backgroundColor: colors.background,
              padding: 16,
              borderWidth: 1,
              borderTopWidth: 0,
              borderColor: colors.primary,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              marginBottom: 12,
            }}
          >
            {renderField("Type d'epilepsie", "epilepsyType", profile.epilepsyType, "Ex: Generalisee, Focale...")}
            {renderField("Medicaments", "medications", profile.medications, "Vos traitements actuels")}
            {renderField("Allergies", "allergies", profile.allergies, "Allergies connues")}
            {renderField("Medecin traitant", "doctor", profile.doctor, "Nom du medecin")}
            {renderField("Tel. medecin", "doctorPhone", profile.doctorPhone, "Telephone du medecin", "phone-pad")}
          </View>
        )}

        {/* Detection Settings Section */}
        {renderSectionHeader("detection", "Parametres de detection", "Sensibilite et seuils")}
        {expandedSection === "detection" && (
          <View
            style={{
              backgroundColor: colors.background,
              padding: 16,
              borderWidth: 1,
              borderTopWidth: 0,
              borderColor: colors.primary,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Sensibilite de detection
            </Text>
            <View className="flex-row gap-2 mb-4">
              {(["low", "medium", "high"] as const).map((level) => {
                const labels = { low: "Faible", medium: "Moyenne", high: "Haute" };
                const descriptions = {
                  low: "Moins d'alertes, risque de manquer des crises",
                  medium: "Equilibre entre detection et fausses alertes",
                  high: "Plus d'alertes, risque de fausses alertes",
                };
                return (
                  <Pressable
                    key={level}
                    onPress={() => updateSettings("sensitivity", level)}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                        borderRadius: 10,
                        alignItems: "center",
                        backgroundColor:
                          settings.sensitivity === level ? colors.primary : colors.surface,
                        borderWidth: 1,
                        borderColor:
                          settings.sensitivity === level ? colors.primary : colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: settings.sensitivity === level ? "#FFFFFF" : colors.foreground,
                      }}
                    >
                      {labels[level]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>
              {settings.sensitivity === "low"
                ? "Moins d'alertes, risque de manquer des crises"
                : settings.sensitivity === "medium"
                ? "Equilibre entre detection et fausses alertes"
                : "Plus d'alertes, risque de fausses alertes"}
            </Text>

            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Duree seuil (secondes)
            </Text>
            <View className="flex-row gap-2 mb-2">
              {[5, 10, 15, 20].map((val) => (
                <Pressable
                  key={val}
                  onPress={() => updateSettings("thresholdDuration", val)}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: "center",
                      backgroundColor:
                        settings.thresholdDuration === val ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor:
                        settings.thresholdDuration === val ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: settings.thresholdDuration === val ? "#FFFFFF" : colors.foreground,
                    }}
                  >
                    {val}s
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              Duree minimale de mouvement anormal avant alerte
            </Text>
          </View>
        )}

        {/* Preferences Section */}
        {renderSectionHeader("preferences", "Preferences", "Notifications, vibration, son")}
        {expandedSection === "preferences" && (
          <View
            style={{
              backgroundColor: colors.background,
              padding: 16,
              borderWidth: 1,
              borderTopWidth: 0,
              borderColor: colors.primary,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              marginBottom: 12,
            }}
          >
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-1">
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  Son d'alarme
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Jouer un son lors d'une alerte
                </Text>
              </View>
              <Switch
                value={settings.soundEnabled}
                onValueChange={(val) => updateSettings("soundEnabled", val)}
                trackColor={{ false: colors.border, true: colors.primary + "80" }}
                thumbColor={settings.soundEnabled ? colors.primary : colors.muted}
              />
            </View>

            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-1">
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  Vibration
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Vibrer lors d'une alerte
                </Text>
              </View>
              <Switch
                value={settings.vibrationEnabled}
                onValueChange={(val) => updateSettings("vibrationEnabled", val)}
                trackColor={{ false: colors.border, true: colors.primary + "80" }}
                thumbColor={settings.vibrationEnabled ? colors.primary : colors.muted}
              />
            </View>

            <View className="flex-row justify-between items-center">
              <View className="flex-1">
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  Appel automatique
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Appeler le 1er contact apres le compte a rebours
                </Text>
              </View>
              <Switch
                value={settings.autoCallEnabled}
                onValueChange={(val) => updateSettings("autoCallEnabled", val)}
                trackColor={{ false: colors.border, true: colors.primary + "80" }}
                thumbColor={settings.autoCallEnabled ? colors.primary : colors.muted}
              />
            </View>
          </View>
        )}

        {/* Night mode settings */}
        <Pressable
          onPress={() => toggleSection("preferences" as any)}
          style={{ marginBottom: 4 }}
        >
          <View
            style={{
              backgroundColor: "#1a1a2e",
              padding: 16,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#6C5CE7",
              marginTop: 4,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 20 }}>🌙</Text>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#A29BFE" }}>Mode nuit</Text>
                <Text style={{ fontSize: 12, color: "#6C5CE7", marginTop: 2 }}>
                  {state.nightModeSettings?.autoActivate
                    ? `Activation auto : ${state.nightModeSettings.startTime} - ${state.nightModeSettings.endTime}`
                    : "Activation manuelle depuis l'accueil"}
                </Text>
              </View>
            </View>
            <Switch
              value={state.nightModeSettings?.autoActivate ?? false}
              onValueChange={(val) =>
                dispatch({
                  type: "UPDATE_NIGHT_MODE_SETTINGS",
                  payload: { autoActivate: val },
                })
              }
              trackColor={{ false: "#333", true: "#6C5CE7" }}
              thumbColor={state.nightModeSettings?.autoActivate ? "#A29BFE" : "#555"}
            />
          </View>
        </Pressable>

        {/* Info section */}
        <View
          style={{
            backgroundColor: colors.primary + "10",
            padding: 16,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.primary + "30",
            marginTop: 8,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary, marginBottom: 6 }}>
            A propos d'EpiGuard
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
            EpiGuard utilise les capteurs de votre smartphone (accelerometre et gyroscope) pour
            detecter les mouvements caracteristiques des crises tonico-cloniques. L'algorithme
            analyse les frequences de mouvement dans la plage 3-8 Hz.{"\n\n"}
            Cette application ne remplace pas un avis medical. Consultez votre neurologue pour
            un suivi adapte.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
