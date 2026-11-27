import { FEATURES, APP_DISPLAY_NAME } from "@/shared/const";
import { useState, useCallback, useRef } from "react";
import {
  Text,
  View,
  ScrollView,
  TextInput,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
} from "react-native";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@epiguard_onboarding_done";

type Step = "welcome" | "profile" | "contacts" | "settings" | "done";

const STEPS: Step[] = FEATURES.autoDetection
  ? ["welcome", "profile", "contacts", "settings", "done"]
  : ["welcome", "profile", "contacts", "done"];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const EPILEPSY_TYPES = [
  "Generalisee",
  "Focale (partielle)",
  "Absence",
  "Myoclonique",
  "Tonico-clonique",
  "Autre / Non determine",
];

export default function OnboardingScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, dispatch } = useAppState();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const scrollRef = useRef<ScrollView>(null);

  // Profile form state
  const [name, setName] = useState(state.medicalProfile.name);
  const [age, setAge] = useState(state.medicalProfile.age);
  const [bloodType, setBloodType] = useState(state.medicalProfile.bloodType);
  const [epilepsyType, setEpilepsyType] = useState(state.medicalProfile.epilepsyType);
  const [medications, setMedications] = useState(state.medicalProfile.medications);
  const [allergies, setAllergies] = useState(state.medicalProfile.allergies);
  const [doctor, setDoctor] = useState(state.medicalProfile.doctor);
  const [doctorPhone, setDoctorPhone] = useState(state.medicalProfile.doctorPhone);

  // Contact form state
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactRelation, setContactRelation] = useState("");

  const currentIndex = STEPS.indexOf(currentStep);
  const progress = (currentIndex + 1) / STEPS.length;

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const goNext = useCallback(() => {
    hapticFeedback();
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [currentIndex, hapticFeedback]);

  const goBack = useCallback(() => {
    hapticFeedback();
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [currentIndex, hapticFeedback]);

  const saveProfile = useCallback(() => {
    dispatch({
      type: "UPDATE_PROFILE",
      payload: {
        name,
        age,
        bloodType,
        epilepsyType,
        medications,
        allergies,
        doctor,
        doctorPhone,
      },
    });
    goNext();
  }, [dispatch, name, age, bloodType, epilepsyType, medications, allergies, doctor, doctorPhone, goNext]);

  const addContact = useCallback(() => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    hapticFeedback();
    dispatch({
      type: "ADD_CONTACT",
      payload: {
        id: Date.now().toString(),
        name: contactName.trim(),
        phone: contactPhone.trim(),
        relation: contactRelation.trim() || "Proche",
      },
    });
    setContactName("");
    setContactPhone("");
    setContactRelation("");
  }, [dispatch, contactName, contactPhone, contactRelation, hapticFeedback]);

  const finishOnboarding = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/(tabs)");
  }, [router]);

  const skipOnboarding = useCallback(async () => {
    hapticFeedback();
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/(tabs)");
  }, [router, hapticFeedback]);

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (t: string) => void,
    placeholder: string,
    keyboardType: "default" | "numeric" | "phone-pad" = "default"
  ) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted + "80"}
        keyboardType={keyboardType}
        returnKeyType="done"
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 14,
          fontSize: 15,
          color: colors.foreground,
        }}
      />
    </View>
  );

  const renderChipSelector = (
    label: string,
    options: string[],
    selected: string,
    onSelect: (v: string) => void
  ) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => {
              hapticFeedback();
              onSelect(opt);
            }}
            style={({ pressed }) => [
              {
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: selected === opt ? colors.primary : colors.border,
                backgroundColor: selected === opt ? colors.primary + "15" : colors.surface,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: selected === opt ? "600" : "400",
                color: selected === opt ? colors.primary : colors.muted,
              }}
            >
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderStepIndicator = () => (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 }}>
      {STEPS.map((step, index) => (
        <View
          key={step}
          style={{
            width: index <= currentIndex ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: index <= currentIndex ? colors.primary : colors.border,
          }}
        />
      ))}
    </View>
  );

  const renderNavButtons = (
    onNext: () => void,
    nextLabel: string = "Continuer",
    showBack: boolean = true,
    showSkip: boolean = false
  ) => (
    <View style={{ marginTop: 20, gap: 10 }}>
      <Pressable
        onPress={onNext}
        style={({ pressed }) => [
          {
            backgroundColor: colors.primary,
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: "center",
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>{nextLabel}</Text>
      </Pressable>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {showBack ? (
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [
              {
                paddingVertical: 12,
                paddingHorizontal: 20,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "500" }}>Retour</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {showSkip ? (
          <Pressable
            onPress={skipOnboarding}
            style={({ pressed }) => [
              {
                paddingVertical: 12,
                paddingHorizontal: 20,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "500" }}>Passer</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>
    </View>
  );

  const renderWelcome = () => (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40 }}>
      <View
        style={{
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: colors.primary + "20",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 30,
        }}
      >
        <Text style={{ fontSize: 48 }}>🛡️</Text>
      </View>
      <Text
        style={{
          fontSize: 28,
          fontWeight: "800",
          color: colors.foreground,
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        Bienvenue sur {APP_DISPLAY_NAME}
      </Text>
      <Text
        style={{
          fontSize: 15,
          color: colors.muted,
          textAlign: "center",
          lineHeight: 22,
          paddingHorizontal: 20,
          marginBottom: 8,
        }}
      >
        {FEATURES.autoDetection
          ? "Votre compagnon de surveillance des crises d'epilepsie. Configurons ensemble votre application en quelques etapes."
          : "Prevenez vos proches en un geste en cas de malaise, suivez votre traitement et gardez un journal de vos malaises. Configurons ensemble votre application en quelques etapes."}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: colors.muted,
          textAlign: "center",
          lineHeight: 20,
          paddingHorizontal: 30,
          marginTop: 16,
        }}
      >
        Nous allons vous guider pour configurer votre profil medical et vos contacts d'urgence.
        Vous pourrez modifier ces informations a tout moment.
      </Text>
      {renderNavButtons(goNext, "Commencer", false, true)}
    </View>
  );

  const renderProfile = () => (
    <View>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "700",
          color: colors.foreground,
          marginBottom: 6,
        }}
      >
        Profil medical
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: colors.muted,
          marginBottom: 20,
          lineHeight: 19,
        }}
      >
        Ces informations seront utiles en cas d'urgence et pour le suivi medical. Tous les champs
        sont facultatifs.
      </Text>

      {renderInput("Nom complet", name, setName, "Votre nom")}
      {renderInput("Age", age, setAge, "Votre age", "numeric")}
      {renderChipSelector("Groupe sanguin", BLOOD_TYPES, bloodType, setBloodType)}
      {renderChipSelector("Type d'epilepsie", EPILEPSY_TYPES, epilepsyType, setEpilepsyType)}
      {renderInput("Medicaments", medications, setMedications, "Ex: Valproate 500mg, Levetiracetam...")}
      {renderInput("Allergies", allergies, setAllergies, "Ex: Penicilline, Aspirine...")}
      {renderInput("Medecin traitant", doctor, setDoctor, "Nom du neurologue")}
      {renderInput("Telephone du medecin", doctorPhone, setDoctorPhone, "+33 ...", "phone-pad")}

      {renderNavButtons(saveProfile, "Enregistrer et continuer", true, false)}
    </View>
  );

  const renderContacts = () => (
    <View>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "700",
          color: colors.foreground,
          marginBottom: 6,
        }}
      >
        Contacts d'urgence
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: colors.muted,
          marginBottom: 20,
          lineHeight: 19,
        }}
      >
        Ajoutez les personnes a prevenir en cas de crise. Elles recevront un SMS et/ou un appel
        automatique.
      </Text>

      {/* Existing contacts */}
      {state.emergencyContacts.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
            Contacts ajoutes ({state.emergencyContacts.length})
          </Text>
          {state.emergencyContacts.map((c) => (
            <View
              key={c.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: colors.primary + "10",
                padding: 12,
                borderRadius: 10,
                marginBottom: 6,
                borderWidth: 1,
                borderColor: colors.primary + "30",
              }}
            >
              <View>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {c.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {c.phone} - {c.relation}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  hapticFeedback();
                  dispatch({ type: "REMOVE_CONTACT", payload: c.id });
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 6 }]}
              >
                <Text style={{ fontSize: 18, color: colors.error }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Add contact form */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
          Ajouter un contact
        </Text>
        {renderInput("Nom", contactName, setContactName, "Nom du contact")}
        {renderInput("Telephone", contactPhone, setContactPhone, "+33 6 ...", "phone-pad")}
        {renderInput("Relation", contactRelation, setContactRelation, "Ex: Conjoint, Parent, Ami...")}
        <Pressable
          onPress={addContact}
          style={({ pressed }) => [
            {
              backgroundColor: contactName.trim() && contactPhone.trim() ? colors.primary : colors.border,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>
            + Ajouter ce contact
          </Text>
        </Pressable>
      </View>

      {renderNavButtons(goNext, "Continuer", true, false)}
    </View>
  );

  const renderSettings = () => (
    <View>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "700",
          color: colors.foreground,
          marginBottom: 6,
        }}
      >
        Parametres de detection
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: colors.muted,
          marginBottom: 20,
          lineHeight: 19,
        }}
      >
        Configurez la sensibilite de la detection et les alertes automatiques.
      </Text>

      {/* Sensitivity */}
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 10 }}>
        Sensibilite de detection
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
        {(["low", "medium", "high"] as const).map((level) => {
          const labels = { low: "Faible", medium: "Moyenne", high: "Elevee" };
          const descs = {
            low: "Moins de fausses alertes",
            medium: "Equilibre recommande",
            high: "Detection maximale",
          };
          const isSelected = state.detectionSettings.sensitivity === level;
          return (
            <Pressable
              key={level}
              onPress={() => {
                hapticFeedback();
                dispatch({ type: "UPDATE_SETTINGS", payload: { sensitivity: level } });
              }}
              style={({ pressed }) => [
                {
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primary + "10" : colors.surface,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: isSelected ? colors.primary : colors.foreground,
                  marginBottom: 4,
                }}
              >
                {labels[level]}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center" }}>
                {descs[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Auto-call toggle */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 16,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
              Appel automatique
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              Appeler automatiquement le premier contact d'urgence apres le compte a rebours de 30
              secondes.
            </Text>
          </View>
          <Pressable
            onPress={() => {
              hapticFeedback();
              dispatch({
                type: "UPDATE_SETTINGS",
                payload: { autoCallEnabled: !state.detectionSettings.autoCallEnabled },
              });
            }}
            style={({ pressed }) => [
              {
                width: 52,
                height: 30,
                borderRadius: 15,
                backgroundColor: state.detectionSettings.autoCallEnabled
                  ? colors.primary
                  : colors.border,
                justifyContent: "center",
                paddingHorizontal: 2,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: "#FFFFFF",
                alignSelf: state.detectionSettings.autoCallEnabled ? "flex-end" : "flex-start",
              }}
            />
          </Pressable>
        </View>
      </View>

      {/* Sound & vibration toggles */}
      {[
        {
          label: "Son d'alerte",
          desc: "Jouer un son fort lors de la detection",
          key: "soundEnabled" as const,
          value: state.detectionSettings.soundEnabled,
        },
        {
          label: "Vibration",
          desc: "Vibrer lors de la detection",
          key: "vibrationEnabled" as const,
          value: state.detectionSettings.vibrationEnabled,
        },
      ].map((item) => (
        <View
          key={item.key}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 10,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                {item.label}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{item.desc}</Text>
            </View>
            <Pressable
              onPress={() => {
                hapticFeedback();
                dispatch({ type: "UPDATE_SETTINGS", payload: { [item.key]: !item.value } });
              }}
              style={({ pressed }) => [
                {
                  width: 52,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: item.value ? colors.primary : colors.border,
                  justifyContent: "center",
                  paddingHorizontal: 2,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: "#FFFFFF",
                  alignSelf: item.value ? "flex-end" : "flex-start",
                }}
              />
            </Pressable>
          </View>
        </View>
      ))}

      {renderNavButtons(goNext, "Continuer", true, false)}
    </View>
  );

  const renderDone = () => (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40 }}>
      <View
        style={{
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: colors.success + "20",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 30,
        }}
      >
        <Text style={{ fontSize: 48 }}>✅</Text>
      </View>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "800",
          color: colors.foreground,
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        Tout est pret !
      </Text>
      <Text
        style={{
          fontSize: 15,
          color: colors.muted,
          textAlign: "center",
          lineHeight: 22,
          paddingHorizontal: 20,
          marginBottom: 8,
        }}
      >
        {FEATURES.autoDetection
          ? "Votre profil medical et vos contacts d'urgence sont configures. Vous pouvez maintenant activer la surveillance."
          : "Votre profil medical et vos contacts d'urgence sont configures. Le bouton SOS est pret a l'emploi."}
      </Text>

      {/* Summary */}
      <View
        style={{
          width: "100%",
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          marginTop: 20,
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 10 }}>
          Resume de la configuration
        </Text>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Nom</Text>
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>
              {state.medicalProfile.name || "Non renseigne"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Type d'epilepsie</Text>
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>
              {state.medicalProfile.epilepsyType || "Non renseigne"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Contacts d'urgence</Text>
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.primary }}>
              {state.emergencyContacts.length} configure(s)
            </Text>
          </View>
          {FEATURES.autoDetection && (
            <>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Sensibilite</Text>
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>
              {{ low: "Faible", medium: "Moyenne", high: "Elevee" }[state.detectionSettings.sensitivity]}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Appel auto</Text>
            <Text style={{ fontSize: 13, fontWeight: "500", color: state.detectionSettings.autoCallEnabled ? colors.success : colors.muted }}>
              {state.detectionSettings.autoCallEnabled ? "Active" : "Desactive"}
            </Text>
          </View>
            </>
          )}
        </View>
      </View>

      <Text
        style={{
          fontSize: 12,
          color: colors.muted,
          textAlign: "center",
          lineHeight: 17,
          paddingHorizontal: 20,
          marginTop: 12,
        }}
      >
        Vous pouvez modifier ces parametres a tout moment depuis l'onglet Profil.
      </Text>

      <View style={{ width: "100%", marginTop: 24 }}>
        <Pressable
          onPress={finishOnboarding}
          style={({ pressed }) => [
            {
              backgroundColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 14,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
            {FEATURES.autoDetection ? "Commencer la surveillance" : "Commencer"}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "welcome":
        return renderWelcome();
      case "profile":
        return renderProfile();
      case "contacts":
        return renderContacts();
      case "settings":
        return renderSettings();
      case "done":
        return renderDone();
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Progress bar */}
        <View style={{ paddingTop: 12, marginBottom: 8 }}>
          <View
            style={{
              height: 4,
              backgroundColor: colors.border,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${progress * 100}%`,
                backgroundColor: colors.primary,
                borderRadius: 2,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              textAlign: "right",
              marginTop: 4,
            }}
          >
            Etape {currentIndex + 1} / {STEPS.length}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
        >
          {renderCurrentStep()}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
