import { useCallback, useMemo } from "react";
import {
  Text,
  View,
  FlatList,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Pressable } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useSmartWatch } from "@/hooks/use-smartwatch";
import { analyzeHeartRateForSeizure, isBLEAvailable } from "@/lib/smartwatch-service";
import * as Haptics from "expo-haptics";

export default function WatchScreen() {
  const colors = useColors();
  const {
    state,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    forgetDevice,
    getHeartRateAnalysis,
  } = useSmartWatch();

  const bleAvailable = isBLEAvailable();

  const hrAnalysis = useMemo(() => {
    if (state.heartRateHistory.length >= 5) {
      return getHeartRateAnalysis();
    }
    return null;
  }, [state.heartRateHistory, getHeartRateAnalysis]);

  const handleScan = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (state.isScanning) {
      stopScan();
    } else {
      startScan();
    }
  }, [state.isScanning, startScan, stopScan]);

  const handleConnect = useCallback(
    (deviceId: string, deviceName: string) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      connectToDevice(deviceId, deviceName);
    },
    [connectToDevice]
  );

  const handleDisconnect = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    disconnect();
  }, [disconnect]);

  const handleForget = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    forgetDevice();
  }, [forgetDevice]);

  // Web / non-BLE platform fallback
  if (!bleAvailable) {
    return (
      <ScreenContainer className="px-6 pt-4">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-2xl font-bold text-foreground">Montre connectee</Text>
          <View className="bg-surface rounded-2xl p-6 border border-border items-center gap-3">
            <Text className="text-6xl">⌚</Text>
            <Text className="text-base text-muted text-center">
              La connexion Bluetooth n'est pas disponible sur cette plateforme.
              Utilisez l'application sur votre telephone pour connecter une montre.
            </Text>
          </View>
          <View className="bg-surface rounded-2xl p-5 border border-border w-full gap-3">
            <Text className="text-base font-semibold text-foreground">
              Appareils compatibles
            </Text>
            <Text className="text-sm text-muted leading-relaxed">
              EpiGuard est compatible avec les montres et bracelets connectes
              qui supportent le protocole Bluetooth Low Energy (BLE) avec le
              service standard de rythme cardiaque :
            </Text>
            <View className="gap-2 mt-1">
              {[
                "Apple Watch (toutes generations)",
                "Samsung Galaxy Watch",
                "Fitbit (Versa, Sense, Charge)",
                "Garmin (Venu, Forerunner, Vivosmart)",
                "Polar (H10, Verity Sense, OH1)",
                "Xiaomi Mi Band / Amazfit",
                "Tout appareil BLE avec service 0x180D",
              ].map((item, i) => (
                <View key={i} className="flex-row items-center gap-2">
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.primary,
                    }}
                  />
                  <Text className="text-sm text-foreground">{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-6 pt-4">
      <FlatList
        data={state.isConnected ? [] : state.discoveredDevices}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="gap-5">
            {/* Header */}
            <View className="items-center gap-1">
              <Text className="text-2xl font-bold text-foreground">
                Montre connectee
              </Text>
              <Text className="text-sm text-muted text-center">
                Connectez un appareil pour ameliorer la detection
              </Text>
            </View>

            {/* Error message */}
            {state.error && (
              <View
                className="rounded-xl p-3 border"
                style={{
                  backgroundColor: colors.error + "15",
                  borderColor: colors.error + "30",
                }}
              >
                <Text style={{ color: colors.error, fontSize: 13 }}>
                  {state.error}
                </Text>
              </View>
            )}

            {/* Connected device card */}
            {state.connectedDevice && (
              <View className="bg-surface rounded-2xl p-5 border border-border gap-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: state.isConnected
                          ? colors.success
                          : colors.warning,
                      }}
                    />
                    <View>
                      <Text className="text-base font-semibold text-foreground">
                        {state.connectedDevice.name}
                      </Text>
                      <Text className="text-xs text-muted">
                        {state.isConnected ? "Connecte" : "Reconnexion..."}
                      </Text>
                    </View>
                  </View>
                  {state.batteryLevel >= 0 && (
                    <View
                      style={{
                        backgroundColor: colors.success + "20",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.success,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {state.batteryLevel}%
                      </Text>
                    </View>
                  )}
                </View>

                {/* Heart rate display */}
                {state.isConnected && (
                  <View className="items-center gap-2 py-3">
                    <Text className="text-sm text-muted">Rythme cardiaque</Text>
                    <View className="flex-row items-end gap-1">
                      <Text
                        style={{
                          fontSize: 56,
                          fontWeight: "800",
                          color:
                            state.heartRate > 100
                              ? colors.error
                              : state.heartRate > 0
                              ? colors.primary
                              : colors.muted,
                        }}
                      >
                        {state.heartRate > 0 ? state.heartRate : "--"}
                      </Text>
                      <Text
                        className="text-muted mb-2"
                        style={{ fontSize: 18, fontWeight: "600" }}
                      >
                        bpm
                      </Text>
                    </View>
                    {state.heartRate > 100 && (
                      <View
                        style={{
                          backgroundColor: colors.error + "15",
                          paddingHorizontal: 12,
                          paddingVertical: 4,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.error,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          Tachycardie detectee
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* HR Analysis */}
                {hrAnalysis && state.isConnected && (
                  <View className="gap-2 pt-2 border-t border-border">
                    <Text className="text-sm font-semibold text-foreground">
                      Analyse cardiaque
                    </Text>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">BPM moyen (baseline)</Text>
                      <Text className="text-xs font-medium text-foreground">
                        {hrAnalysis.averageBpm} bpm
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">Tachycardie</Text>
                      <Text
                        className="text-xs font-medium"
                        style={{
                          color: hrAnalysis.isTachycardia
                            ? colors.error
                            : colors.success,
                        }}
                      >
                        {hrAnalysis.isTachycardia ? "Oui" : "Non"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">Augmentation rapide</Text>
                      <Text
                        className="text-xs font-medium"
                        style={{
                          color: hrAnalysis.rapidIncrease
                            ? colors.warning
                            : colors.success,
                        }}
                      >
                        {hrAnalysis.rapidIncrease ? "Oui" : "Non"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">Anomalie HRV</Text>
                      <Text
                        className="text-xs font-medium"
                        style={{
                          color: hrAnalysis.hrvAnomaly
                            ? colors.warning
                            : colors.success,
                        }}
                      >
                        {hrAnalysis.hrvAnomaly ? "Oui" : "Non"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center mt-1">
                      <Text className="text-xs text-muted">Score de confiance</Text>
                      <View
                        style={{
                          backgroundColor:
                            hrAnalysis.confidenceScore > 0.5
                              ? colors.error + "20"
                              : hrAnalysis.confidenceScore > 0.2
                              ? colors.warning + "20"
                              : colors.success + "20",
                          paddingHorizontal: 10,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color:
                              hrAnalysis.confidenceScore > 0.5
                                ? colors.error
                                : hrAnalysis.confidenceScore > 0.2
                                ? colors.warning
                                : colors.success,
                          }}
                        >
                          {Math.round(hrAnalysis.confidenceScore * 100)}%
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Disconnect / Forget buttons */}
                <View className="flex-row gap-3 pt-2">
                  <Pressable
                    onPress={handleDisconnect}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        backgroundColor: colors.warning + "15",
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        opacity: pressed ? 0.85 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      },
                    ]}
                  >
                    <Text style={{ color: colors.warning, fontWeight: "600", fontSize: 14 }}>
                      Deconnecter
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleForget}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        backgroundColor: colors.error + "15",
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        opacity: pressed ? 0.85 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      },
                    ]}
                  >
                    <Text style={{ color: colors.error, fontWeight: "600", fontSize: 14 }}>
                      Oublier
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Scan button (when no device connected) */}
            {!state.connectedDevice && (
              <Pressable
                onPress={handleScan}
                style={({ pressed }) => [
                  {
                    backgroundColor: state.isScanning
                      ? colors.warning
                      : colors.primary,
                    paddingVertical: 16,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                {state.isScanning && (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                )}
                <Text
                  style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}
                >
                  {state.isScanning
                    ? "Recherche en cours..."
                    : "Rechercher des appareils"}
                </Text>
              </Pressable>
            )}

            {/* Discovered devices header */}
            {!state.isConnected &&
              state.discoveredDevices.length > 0 && (
                <Text className="text-sm font-semibold text-foreground mt-2">
                  Appareils detectes ({state.discoveredDevices.length})
                </Text>
              )}

            {/* Scanning indicator */}
            {state.isScanning && state.discoveredDevices.length === 0 && (
              <View className="items-center py-8 gap-3">
                <ActivityIndicator size="large" color={colors.primary} />
                <Text className="text-sm text-muted text-center">
                  Recherche d'appareils Bluetooth a proximite...{"\n"}
                  Assurez-vous que votre montre est allumee et a portee.
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              handleConnect(item.id, item.name || "Appareil inconnu")
            }
            style={({ pressed }) => [
              {
                backgroundColor: pressed
                  ? colors.primary + "10"
                  : colors.surface,
                borderRadius: 14,
                padding: 16,
                marginTop: 8,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View className="flex-row items-center gap-3 flex-1">
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.primary + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 20 }}>⌚</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">
                  {item.name || "Appareil inconnu"}
                </Text>
                <Text className="text-xs text-muted">
                  Signal: {item.rssi ? `${item.rssi} dBm` : "N/A"}
                </Text>
              </View>
            </View>
            <View
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13 }}>
                Connecter
              </Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          <View className="gap-4 mt-6 mb-8">
            {/* How it works */}
            <View className="bg-surface rounded-2xl p-5 border border-border gap-3">
              <Text className="text-base font-semibold text-foreground">
                Comment ca fonctionne
              </Text>
              <Text className="text-sm text-muted leading-relaxed">
                En connectant une montre ou un bracelet connecte, EpiGuard
                utilise les donnees de rythme cardiaque pour ameliorer la
                precision de la detection des crises. L'algorithme combine :
              </Text>
              <View className="gap-2">
                {[
                  {
                    emoji: "📱",
                    title: "Capteurs du telephone",
                    desc: "Accelerometre + gyroscope (mouvements)",
                  },
                  {
                    emoji: "⌚",
                    title: "Montre connectee",
                    desc: "Rythme cardiaque + variabilite (HRV)",
                  },
                  {
                    emoji: "🧠",
                    title: "Analyse multi-source",
                    desc: "Score de confiance combine pour moins de fausses alertes",
                  },
                ].map((item, i) => (
                  <View key={i} className="flex-row gap-3 items-start">
                    <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        {item.title}
                      </Text>
                      <Text className="text-xs text-muted">{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Compatible devices */}
            <View className="bg-surface rounded-2xl p-5 border border-border gap-3">
              <Text className="text-base font-semibold text-foreground">
                Appareils compatibles
              </Text>
              <Text className="text-sm text-muted leading-relaxed">
                Tout appareil Bluetooth Low Energy avec service de rythme
                cardiaque standard (0x180D) :
              </Text>
              <View className="gap-1">
                {[
                  "Apple Watch",
                  "Samsung Galaxy Watch",
                  "Fitbit (Versa, Sense, Charge)",
                  "Garmin (Venu, Forerunner)",
                  "Polar (H10, Verity Sense)",
                  "Xiaomi Mi Band / Amazfit",
                ].map((name, i) => (
                  <View key={i} className="flex-row items-center gap-2">
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: colors.primary,
                      }}
                    />
                    <Text className="text-sm text-foreground">{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        }
      />
    </ScreenContainer>
  );
}
