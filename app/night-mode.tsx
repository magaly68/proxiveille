import { useEffect, useRef } from "react";
import { Text, View, Pressable, StatusBar, Animated, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import { useAppState } from "@/lib/app-context";
import { useSeizureDetection } from "@/hooks/use-seizure-detection";
import { useNightMode } from "@/hooks/use-night-mode";

// ─── Night Mode Screen ────────────────────────────────────────────────────────
// Minimal full-screen dark UI optimised for overnight seizure monitoring.
// Shows only the essential status indicator and an exit button.

export default function NightModeScreen() {
  const router = useRouter();
  const { state } = useAppState();
  const { isNightModeActive, deactivateNightMode } = useNightMode();

  // Keep screen awake while night mode is active
  useKeepAwake();

  // Pulse animation for the status circle
  const pulse = useRef(new Animated.Value(1)).current;

  const { monitoringStatus } = state;

  useEffect(() => {
    if (monitoringStatus === "alarm" || monitoringStatus === "warning") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [monitoringStatus, pulse]);

  const statusColor =
    monitoringStatus === "alarm"
      ? "#FF1744"
      : monitoringStatus === "warning"
      ? "#FF9100"
      : monitoringStatus === "active"
      ? "#00C853"
      : "#444";

  const statusLabel =
    monitoringStatus === "alarm"
      ? "CRISE DÉTECTÉE"
      : monitoringStatus === "warning"
      ? "ATTENTION"
      : monitoringStatus === "active"
      ? "Surveillance active"
      : "Surveillance inactive";

  const handleExit = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    deactivateNightMode();
    router.back();
  };

  const currentTime = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Clock */}
      <Text style={{ fontSize: 48, fontWeight: "200", color: "#555", marginBottom: 60, letterSpacing: 4 }}>
        {currentTime}
      </Text>

      {/* Status circle */}
      <Animated.View
        style={{
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: statusColor + "20",
          borderWidth: 3,
          borderColor: statusColor,
          justifyContent: "center",
          alignItems: "center",
          transform: [{ scale: pulse }],
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: statusColor,
            marginBottom: 12,
          }}
        />
        <Text style={{ fontSize: 13, fontWeight: "700", color: statusColor, textAlign: "center", letterSpacing: 1 }}>
          {statusLabel}
        </Text>
      </Animated.View>

      {/* Monitoring info */}
      <View style={{ marginTop: 48, alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 13, color: "#444" }}>
          {state.emergencyContacts.length} contact(s) d'urgence configuré(s)
        </Text>
        <Text style={{ fontSize: 13, color: "#444" }}>
          Sensibilité : {state.detectionSettings.sensitivity === "low" ? "Faible" : state.detectionSettings.sensitivity === "medium" ? "Moyenne" : "Haute"}
        </Text>
      </View>

      {/* Exit button */}
      <Pressable
        onPress={handleExit}
        style={({ pressed }) => ({
          opacity: pressed ? 0.6 : 0.4,
          marginTop: 80,
          borderWidth: 1,
          borderColor: "#333",
          borderRadius: 12,
          paddingHorizontal: 28,
          paddingVertical: 12,
        })}
      >
        <Text style={{ fontSize: 14, color: "#555", fontWeight: "600" }}>
          Quitter le mode nuit
        </Text>
      </Pressable>
    </View>
  );
}
