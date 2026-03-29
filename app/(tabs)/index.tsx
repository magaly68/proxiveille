import { useEffect, useRef, useCallback, useState } from "react";
import { Text, View, ScrollView, Platform, Linking, AppState } from "react-native";
import { useRouter } from "expo-router";
import { useNightMode } from "@/hooks/use-night-mode";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useSeizureDetection } from "@/hooks/use-seizure-detection";
import { useSmartWatch } from "@/hooks/use-smartwatch";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import {
  sendEmergencyContactsAlertedNotification,
  sendSeizureAlertNotification,
  sendSmsSentNotification,
} from "@/lib/notification-service";
import { sendEmergencySmsToContacts } from "@/lib/emergency-sms-client";
import { requestLocationPermission, checkLocationPermission, getEmergencyLocation } from "@/lib/location-service";

const STATUS_CONFIG = {
  inactive: {
    label: "Surveillance inactive",
    sublabel: "Appuyez pour demarrer",
    colorKey: "muted" as const,
  },
  active: {
    label: "Surveillance active",
    sublabel: "Aucun mouvement anormal detecte",
    colorKey: "success" as const,
  },
  warning: {
    label: "Mouvement suspect",
    sublabel: "Analyse en cours...",
    colorKey: "warning" as const,
  },
  alarm: {
    label: "Crise detectee !",
    sublabel: "Alerte en cours d'envoi",
    colorKey: "error" as const,
  },
};

/**
 * Calculate intensity from sensor data automatically
 * Based on acceleration magnitude, gyroscope, heart rate and detection confidence
 */
function calculateIntensity(sensorData: {
  peakAcceleration: number;
  peakGyroscope: number;
  peakHeartRate: number;
  detectionConfidence: number;
}): "low" | "medium" | "high" {
  let score = 0;

  // Acceleration contribution (0-3 points)
  if (sensorData.peakAcceleration > 4.0) score += 3;
  else if (sensorData.peakAcceleration > 2.5) score += 2;
  else if (sensorData.peakAcceleration > 1.5) score += 1;

  // Gyroscope contribution (0-2 points)
  if (sensorData.peakGyroscope > 6.0) score += 2;
  else if (sensorData.peakGyroscope > 3.0) score += 1;

  // Heart rate contribution (0-2 points)
  if (sensorData.peakHeartRate > 140) score += 2;
  else if (sensorData.peakHeartRate > 110) score += 1;

  // Detection confidence contribution (0-2 points)
  if (sensorData.detectionConfidence > 0.8) score += 2;
  else if (sensorData.detectionConfidence > 0.5) score += 1;

  // Map score to intensity
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export default function HomeScreen() {
  const colors = useColors();
  const { state, dispatch } = useAppState();
  const { state: watchState } = useSmartWatch();
  const { isNightModeActive, toggleNightMode } = useNightMode();
  const router = useRouter();
  const {
    startDetection,
    stopDetection,
    resetToActive,
    cancelAlarmWithNotification,
    getSensorReadings,
    status,
  } = useSeizureDetection(watchState.heartRateHistory);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const [gpsEnabled, setGpsEnabled] = useState(false);

  // Request GPS permission on mount and when monitoring starts
  useEffect(() => {
    checkLocationPermission().then(setGpsEnabled);
  }, []);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);

  const statusConfig = STATUS_CONFIG[status];
  const statusColor = colors[statusConfig.colorKey];

  // Pulse animation for active/warning/alarm states
  useEffect(() => {
    if (status === "active") {
      pulseScale.value = withRepeat(
        withTiming(1.15, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withTiming(0.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else if (status === "warning" || status === "alarm") {
      pulseScale.value = withRepeat(
        withTiming(1.25, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withTiming(0.05, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [status]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Handle alarm countdown
  useEffect(() => {
    if (status === "alarm" && !state.countdownActive) {
      dispatch({ type: "SET_COUNTDOWN", payload: { active: true, seconds: 30 } });
    }
  }, [status]);

  useEffect(() => {
    if (state.countdownActive && state.countdownSeconds > 0) {
      countdownRef.current = setInterval(() => {
        dispatch({
          type: "SET_COUNTDOWN",
          payload: { active: true, seconds: state.countdownSeconds - 1 },
        });
      }, 1000);
    } else if (state.countdownActive && state.countdownSeconds <= 0) {
      // Countdown finished - record seizure with full sensor data
      dispatch({ type: "SET_COUNTDOWN", payload: { active: false, seconds: 30 } });

      const now = Date.now();
      const alarmStart = state.alarmStartTimestamp || now;
      const durationSeconds = Math.round((now - alarmStart) / 1000);
      const sensorSnapshot = state.currentAlarmSensorData;
      const readings = getSensorReadings();

      // Build enriched sensor data for the seizure record
      const sensorData = sensorSnapshot
        ? {
            peakAcceleration: sensorSnapshot.peakAcceleration,
            avgAcceleration:
              sensorSnapshot.accelSamples > 0
                ? Math.round((sensorSnapshot.avgAcceleration / sensorSnapshot.accelSamples) * 100) / 100
                : 0,
            peakGyroscope: sensorSnapshot.peakGyroscope,
            avgHeartRate:
              sensorSnapshot.hrSamples > 0
                ? Math.round(sensorSnapshot.avgHeartRate / sensorSnapshot.hrSamples)
                : 0,
            peakHeartRate: sensorSnapshot.peakHeartRate,
            detectionConfidence: Math.round(sensorSnapshot.detectionConfidence * 100) / 100,
            detectionSource: sensorSnapshot.detectionSource,
            roiPowerRatio: Math.round(sensorSnapshot.roiPowerRatio * 1000) / 1000,
          }
        : {
            peakAcceleration: readings.currentAccelMagnitude,
            avgAcceleration: readings.currentAccelMagnitude,
            peakGyroscope: readings.currentGyroMagnitude,
            avgHeartRate: readings.currentHeartRate,
            peakHeartRate: readings.currentHeartRate,
            detectionConfidence: readings.currentCombinedScore,
            detectionSource: (readings.hasWatch ? "combined" : "phone") as "phone" | "watch" | "combined",
            roiPowerRatio: readings.currentRoiRatio,
          };

      // Calculate intensity automatically from sensor data
      const autoIntensity = calculateIntensity({
        peakAcceleration: sensorData.peakAcceleration,
        peakGyroscope: sensorData.peakGyroscope,
        peakHeartRate: sensorData.peakHeartRate,
        detectionConfidence: sensorData.detectionConfidence,
      });

      dispatch({
        type: "ADD_SEIZURE",
        payload: {
          id: now.toString(),
          timestamp: alarmStart,
          endTimestamp: now,
          duration: durationSeconds,
          intensity: autoIntensity,
          notes: `Crise detectee automatiquement (confiance: ${Math.round(sensorData.detectionConfidence * 100)}%, source: ${sensorData.detectionSource === "combined" ? "telephone + montre" : sensorData.detectionSource === "watch" ? "montre" : "telephone"})`,
          wasManual: false,
          wasCancelled: false,
          sensorData,
        },
      });

      // Capture GPS location and attach to seizure record
      getEmergencyLocation().then((gpsResult) => {
        if (gpsResult.location) {
          dispatch({
            type: "UPDATE_SEIZURE_LOCATION",
            payload: {
              seizureId: now.toString(),
              location: {
                latitude: gpsResult.location.latitude,
                longitude: gpsResult.location.longitude,
                accuracy: gpsResult.location.accuracy,
                address: gpsResult.address,
                googleMapsUrl: gpsResult.googleMapsUrl || `https://maps.google.com/maps?q=${gpsResult.location.latitude},${gpsResult.location.longitude}`,
              },
            },
          });
        }
      }).catch(() => {
        // GPS is optional, don't fail the seizure recording
      });

      // Clear alarm tracking
      dispatch({ type: "CLEAR_ALARM_TRACKING" });

      // Send seizure notification
      sendSeizureAlertNotification();

      // Auto-call: call first emergency contact or SAMU
      if (state.detectionSettings.autoCallEnabled && state.emergencyContacts.length > 0) {
        const firstContact = state.emergencyContacts[0];
        const phoneUrl = `tel:${firstContact.phone}`;
        Linking.canOpenURL(phoneUrl).then((supported) => {
          if (supported) {
            Linking.openURL(phoneUrl);
          }
        });
      } else if (state.detectionSettings.autoCallEnabled) {
        Linking.canOpenURL("tel:15").then((supported) => {
          if (supported) {
            Linking.openURL("tel:15");
          }
        });
      }

      // Send SMS alert to all contacts via Twilio backend
      if (state.emergencyContacts.length > 0) {
        const patientName = state.medicalProfile.name || "Patient EpiGuard";
        sendEmergencySmsToContacts(
          state.emergencyContacts.map((c) => ({ name: c.name, phone: c.phone })),
          patientName,
          {
            timestamp: alarmStart,
            intensity: autoIntensity,
            duration: durationSeconds,
            detectionSource: sensorData.detectionSource,
          }
        ).then((result) => {
          if (result && result.totalSent > 0) {
            console.log(`[Emergency] ${result.totalSent} SMS envoyes via Twilio`);
          } else {
            // Fallback: open native SMS app if Twilio fails
            console.log("[Emergency] Twilio unavailable, fallback to native SMS");
            const phones = state.emergencyContacts.map((c) => c.phone).join(",");
            const message = encodeURIComponent(state.detectionSettings.alertMessage);
            const smsUrl = Platform.OS === "ios"
              ? `sms:${phones}&body=${message}`
              : `sms:${phones}?body=${message}`;
            Linking.canOpenURL(smsUrl).then((supported) => {
              if (supported) {
                Linking.openURL(smsUrl);
              }
            });
          }
        }).catch(() => {
          // Fallback on error
          const phones = state.emergencyContacts.map((c) => c.phone).join(",");
          const message = encodeURIComponent(state.detectionSettings.alertMessage);
          const smsUrl = Platform.OS === "ios"
            ? `sms:${phones}&body=${message}`
            : `sms:${phones}?body=${message}`;
          Linking.canOpenURL(smsUrl).then((supported) => {
            if (supported) {
              Linking.openURL(smsUrl);
            }
          });
        });
        sendEmergencyContactsAlertedNotification(state.emergencyContacts.length);
      }

      resetToActive();
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [state.countdownActive, state.countdownSeconds]);

  const handleToggleMonitoring = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (state.isMonitoring) {
      stopDetection();
    } else {
      // Request GPS permission when starting monitoring
      const hasGps = await requestLocationPermission();
      setGpsEnabled(hasGps);
      startDetection();
    }
  }, [state.isMonitoring, startDetection, stopDetection]);

  const handleCancelAlarm = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    dispatch({ type: "SET_COUNTDOWN", payload: { active: false, seconds: 30 } });
    dispatch({ type: "CLEAR_ALARM_TRACKING" });
    cancelAlarmWithNotification();
  }, [dispatch, cancelAlarmWithNotification]);

  const lastSeizure = state.seizureEvents.length > 0 ? state.seizureEvents[0] : null;
  const lastSeizureText = lastSeizure
    ? new Date(lastSeizure.timestamp).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Aucune crise enregistree";

  return (
    <ScreenContainer className="px-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 items-center pt-4 gap-6">
          {/* Header */}
          <View className="items-center gap-1">
            <Text className="text-2xl font-bold text-foreground">EpiGuard</Text>
            <Text className="text-sm text-muted">Detection des crises d'epilepsie</Text>
          </View>

          {/* Status Indicator */}
          <View className="items-center justify-center my-6" style={{ height: 220 }}>
            <Animated.View
              style={[
                {
                  position: "absolute",
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  backgroundColor: statusColor,
                },
                pulseStyle,
              ]}
            />
            <Pressable
              onPress={handleToggleMonitoring}
              style={({ pressed }) => [
                {
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  backgroundColor: statusColor,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Text
                style={{
                  fontSize: status === "alarm" ? 16 : 14,
                  fontWeight: "700",
                  color: "#FFFFFF",
                  textAlign: "center",
                  paddingHorizontal: 16,
                }}
              >
                {statusConfig.label}
              </Text>
              {status === "inactive" && (
                <Text
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.8)",
                    marginTop: 4,
                    textAlign: "center",
                  }}
                >
                  Appuyez pour demarrer
                </Text>
              )}
              {status !== "inactive" && (
                <Text
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.8)",
                    marginTop: 4,
                    textAlign: "center",
                    paddingHorizontal: 12,
                  }}
                >
                  Appuyez pour arreter
                </Text>
              )}
            </Pressable>
          </View>

          {/* Countdown (alarm mode) */}
          {state.countdownActive && (
            <View className="w-full bg-surface rounded-2xl p-5 border border-border items-center gap-3">
              <Text className="text-base font-semibold text-error">
                Crise detectee - Alerte dans :
              </Text>
              <Text style={{ fontSize: 48, fontWeight: "800", color: colors.error }}>
                {state.countdownSeconds}s
              </Text>
              <Pressable
                onPress={handleCancelAlarm}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.primary,
                    paddingHorizontal: 32,
                    paddingVertical: 14,
                    borderRadius: 12,
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
                  Fausse alerte - Annuler
                </Text>
              </Pressable>
            </View>
          )}

          {/* Background monitoring indicator */}
          {state.isMonitoring && (
            <View
              className="w-full rounded-xl p-3 border flex-row items-center gap-3"
              style={{
                backgroundColor: colors.primary + "10",
                borderColor: colors.primary + "30",
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.success,
                }}
              />
              <Text style={{ color: colors.primary, fontSize: 12, flex: 1 }}>
                Surveillance active en arriere-plan. Vous serez alerte meme si l'app est minimisee.
              </Text>
            </View>
          )}

          {/* Night mode button */}
          <Pressable
            onPress={() => router.push("/night-mode")}
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
              width: "100%",
              backgroundColor: isNightModeActive ? "#1a1a2e" : colors.surface,
              borderRadius: 14,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderWidth: 1,
              borderColor: isNightModeActive ? "#6C5CE7" : colors.border,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 20 }}>🌙</Text>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: isNightModeActive ? "#A29BFE" : colors.foreground }}>
                  Mode nuit
                </Text>
                <Text style={{ fontSize: 12, color: isNightModeActive ? "#6C5CE7" : colors.muted, marginTop: 2 }}>
                  {isNightModeActive ? "Actif - Surveillance nocturne" : "Interface simplifiee pour la nuit"}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 16, color: isNightModeActive ? "#A29BFE" : colors.muted }}>›</Text>
          </Pressable>

          {/* Status subtitle */}
          <View className="w-full bg-surface rounded-2xl p-4 border border-border">
            <Text className="text-sm text-muted text-center">{statusConfig.sublabel}</Text>
          </View>

          {/* Info cards */}
          <View className="w-full gap-3">
            {/* Sensitivity */}
            <View className="w-full bg-surface rounded-xl p-4 border border-border flex-row justify-between items-center">
              <Text className="text-sm text-muted">Sensibilite</Text>
              <View
                style={{
                  backgroundColor: colors.primary + "20",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {state.detectionSettings.sensitivity === "low"
                    ? "Faible"
                    : state.detectionSettings.sensitivity === "medium"
                    ? "Moyenne"
                    : "Haute"}
                </Text>
              </View>
            </View>

            {/* Last seizure */}
            <View className="w-full bg-surface rounded-xl p-4 border border-border flex-row justify-between items-center">
              <Text className="text-sm text-muted">Derniere crise</Text>
              <Text className="text-sm font-medium text-foreground" style={{ maxWidth: "60%" }} numberOfLines={1}>
                {lastSeizureText}
              </Text>
            </View>

            {/* Last seizure details (if available) */}
            {lastSeizure && lastSeizure.sensorData && (
              <View className="w-full bg-surface rounded-xl p-4 border border-border">
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                  Derniere crise - Details
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <View style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, color: colors.primary }}>
                      Duree: {lastSeizure.duration}s
                    </Text>
                  </View>
                  {lastSeizure.sensorData.avgHeartRate > 0 && (
                    <View style={{ backgroundColor: colors.error + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: colors.error }}>
                        FC moy: {lastSeizure.sensorData.avgHeartRate} bpm
                      </Text>
                    </View>
                  )}
                  <View style={{ backgroundColor: colors.warning + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, color: colors.warning }}>
                      Confiance: {Math.round(lastSeizure.sensorData.detectionConfidence * 100)}%
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Total seizures */}
            <View className="w-full bg-surface rounded-xl p-4 border border-border flex-row justify-between items-center">
              <Text className="text-sm text-muted">Crises ce mois</Text>
              <Text className="text-sm font-semibold text-foreground">
                {state.seizureEvents.filter((e) => {
                  const now = new Date();
                  const eventDate = new Date(e.timestamp);
                  return (
                    eventDate.getMonth() === now.getMonth() &&
                    eventDate.getFullYear() === now.getFullYear()
                  );
                }).length}
              </Text>
            </View>

            {/* Smartwatch connection */}
            <View className="w-full bg-surface rounded-xl p-4 border border-border flex-row justify-between items-center">
              <Text className="text-sm text-muted">Montre connectee</Text>
              <View className="flex-row items-center gap-2">
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: watchState.isConnected
                      ? colors.success
                      : colors.muted,
                  }}
                />
                <Text className="text-sm font-medium text-foreground">
                  {watchState.isConnected
                    ? `${watchState.heartRate > 0 ? watchState.heartRate + " bpm" : "Connectee"}`
                    : "Non connectee"}
                </Text>
              </View>
            </View>

            {/* GPS status */}
            <View className="w-full bg-surface rounded-xl p-4 border border-border flex-row justify-between items-center">
              <Text className="text-sm text-muted">Localisation GPS</Text>
              <View className="flex-row items-center gap-2">
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: gpsEnabled ? colors.success : colors.warning,
                  }}
                />
                <Text className="text-sm font-medium text-foreground">
                  {gpsEnabled ? "Active" : "Non autorisee"}
                </Text>
              </View>
            </View>

            {/* Emergency contacts count */}
            <View className="w-full bg-surface rounded-xl p-4 border border-border flex-row justify-between items-center">
              <Text className="text-sm text-muted">Contacts d'urgence</Text>
              <Text className="text-sm font-semibold text-foreground">
                {state.emergencyContacts.length} configure(s)
              </Text>
            </View>
          </View>

          {/* Bottom spacing */}
          <View style={{ height: 20 }} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
