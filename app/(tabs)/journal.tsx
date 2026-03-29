import { useState, useCallback, useMemo } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  Platform,
  Modal,
  Share,
  ScrollView,
  Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppState, type SeizureEvent } from "@/lib/app-context";
import * as Haptics from "expo-haptics";

type FilterPeriod = "7d" | "30d" | "90d" | "all";

const FILTER_LABELS: Record<FilterPeriod, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "90 jours",
  all: "Tout",
};

const INTENSITY_LABELS = {
  low: { label: "Faible", color: "#22C55E" },
  medium: { label: "Moyenne", color: "#FF9100" },
  high: { label: "Forte", color: "#FF1744" },
};

const SOURCE_LABELS: Record<string, string> = {
  phone: "Telephone",
  watch: "Montre",
  combined: "Tel. + Montre",
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "< 1s";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}min ${secs}s` : `${mins}min`;
}

export default function JournalScreen() {
  const colors = useColors();
  const { state, dispatch } = useAppState();
  const [filter, setFilter] = useState<FilterPeriod>("30d");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<SeizureEvent | null>(null);
  const [notesText, setNotesText] = useState("");
  const [newIntensity, setNewIntensity] = useState<"low" | "medium" | "high">("medium");
  const [newDuration, setNewDuration] = useState("");

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const msPerDay = 86400000;
    const filterMs: Record<FilterPeriod, number> = {
      "7d": 7 * msPerDay,
      "30d": 30 * msPerDay,
      "90d": 90 * msPerDay,
      all: Infinity,
    };
    const cutoff = now - filterMs[filter];
    return state.seizureEvents.filter((e) => e.timestamp >= cutoff);
  }, [state.seizureEvents, filter]);

  const stats = useMemo(() => {
    const count = filteredEvents.length;
    const eventsWithDuration = filteredEvents.filter((e) => e.duration > 0);
    const avgDuration =
      eventsWithDuration.length > 0
        ? Math.round(eventsWithDuration.reduce((a, e) => a + e.duration, 0) / eventsWithDuration.length)
        : 0;
    const lowCount = filteredEvents.filter((e) => e.intensity === "low").length;
    const medCount = filteredEvents.filter((e) => e.intensity === "medium").length;
    const highCount = filteredEvents.filter((e) => e.intensity === "high").length;
    const manualCount = filteredEvents.filter((e) => e.wasManual).length;
    const autoCount = count - manualCount;
    const avgConfidence = filteredEvents.filter((e) => e.sensorData).length > 0
      ? Math.round(
          (filteredEvents
            .filter((e) => e.sensorData)
            .reduce((a, e) => a + (e.sensorData?.detectionConfidence || 0), 0) /
            filteredEvents.filter((e) => e.sensorData).length) *
            100
        )
      : 0;
    return { count, avgDuration, lowCount, medCount, highCount, manualCount, autoCount, avgConfidence };
  }, [filteredEvents]);

  const handleExportReport = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const profile = state.medicalProfile;
    const lines: string[] = [
      "=== RAPPORT MEDICAL EPIGUARD ===",
      `Date du rapport : ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`,
      "",
      "--- PATIENT ---",
      `Nom : ${profile.name || "Non renseigne"}`,
      `Age : ${profile.age || "Non renseigne"}`,
      `Groupe sanguin : ${profile.bloodType || "Non renseigne"}`,
      `Type d'epilepsie : ${profile.epilepsyType || "Non renseigne"}`,
      `Medicaments : ${profile.medications || "Non renseigne"}`,
      `Allergies : ${profile.allergies || "Non renseigne"}`,
      "",
      `--- STATISTIQUES (${FILTER_LABELS[filter]}) ---`,
      `Nombre de crises : ${stats.count}`,
      `Duree moyenne : ${formatDuration(stats.avgDuration)}`,
      `Intensite faible : ${stats.lowCount}`,
      `Intensite moyenne : ${stats.medCount}`,
      `Intensite forte : ${stats.highCount}`,
      `Detection auto : ${stats.autoCount}`,
      `Saisie manuelle : ${stats.manualCount}`,
      `Confiance moyenne : ${stats.avgConfidence}%`,
      "",
      "--- HISTORIQUE DETAILLE DES CRISES ---",
    ];
    filteredEvents.forEach((e, idx) => {
      const d = new Date(e.timestamp);
      lines.push(`\n--- Crise #${idx + 1} ---`);
      lines.push(`Date : ${d.toLocaleDateString("fr-FR")} a ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
      lines.push(`Duree : ${formatDuration(e.duration)}`);
      lines.push(`Intensite : ${INTENSITY_LABELS[e.intensity].label}`);
      lines.push(`Type : ${e.wasManual ? "Saisie manuelle" : "Detection automatique"}`);
      if (e.sensorData) {
        lines.push(`Source de detection : ${SOURCE_LABELS[e.sensorData.detectionSource] || e.sensorData.detectionSource}`);
        lines.push(`Confiance : ${Math.round(e.sensorData.detectionConfidence * 100)}%`);
        lines.push(`Acceleration max : ${e.sensorData.peakAcceleration.toFixed(2)} g`);
        lines.push(`Acceleration moy : ${e.sensorData.avgAcceleration.toFixed(2)} g`);
        lines.push(`Gyroscope max : ${e.sensorData.peakGyroscope.toFixed(2)} rad/s`);
        if (e.sensorData.avgHeartRate > 0) {
          lines.push(`Freq. cardiaque moy : ${e.sensorData.avgHeartRate} bpm`);
          lines.push(`Freq. cardiaque max : ${e.sensorData.peakHeartRate} bpm`);
        }
        lines.push(`Ratio puissance ROI : ${(e.sensorData.roiPowerRatio * 100).toFixed(1)}%`);
      }
      if (e.location) {
        if (e.location.address) lines.push(`Adresse : ${e.location.address}`);
        lines.push(`Coordonnees GPS : ${e.location.latitude.toFixed(5)}, ${e.location.longitude.toFixed(5)}`);
        lines.push(`Google Maps : ${e.location.googleMapsUrl}`);
        if (e.location.accuracy) lines.push(`Precision GPS : ~${Math.round(e.location.accuracy)}m`);
      }
      if (e.notes) lines.push(`Notes : ${e.notes}`);
    });
    lines.push("\n--- FIN DU RAPPORT ---");
    lines.push("Ce rapport a ete genere par EpiGuard. Il ne remplace pas un avis medical.");

    const reportText = lines.join("\n");
    try {
      await Share.share({
        message: reportText,
        title: "Rapport EpiGuard",
      });
    } catch (e) {
      if (Platform.OS === "web") {
        try {
          await navigator.clipboard.writeText(reportText);
          alert("Rapport copie dans le presse-papiers !");
        } catch {
          alert("Impossible de partager le rapport.");
        }
      }
    }
  }, [state.medicalProfile, filteredEvents, stats, filter]);

  const handleAddManualSeizure = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const durationValue = parseInt(newDuration, 10);
    dispatch({
      type: "ADD_SEIZURE",
      payload: {
        id: Date.now().toString(),
        timestamp: Date.now(),
        duration: isNaN(durationValue) ? 0 : durationValue,
        intensity: newIntensity,
        notes: notesText,
        wasManual: true,
        wasCancelled: false,
      },
    });
    setShowAddModal(false);
    setNotesText("");
    setNewIntensity("medium");
    setNewDuration("");
  }, [dispatch, newIntensity, notesText, newDuration]);

  const handleSaveNotes = useCallback(() => {
    if (selectedEvent) {
      dispatch({
        type: "UPDATE_SEIZURE_NOTES",
        payload: { id: selectedEvent.id, notes: notesText },
      });
    }
    setShowNotesModal(false);
    setSelectedEvent(null);
    setNotesText("");
  }, [dispatch, selectedEvent, notesText]);

  const handleDeleteEvent = useCallback(
    (id: string) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      dispatch({ type: "DELETE_SEIZURE", payload: id });
    },
    [dispatch]
  );

  const handleOpenDetail = useCallback((event: SeizureEvent) => {
    setSelectedEvent(event);
    setShowDetailModal(true);
  }, []);

  const renderEvent = useCallback(
    ({ item }: { item: SeizureEvent }) => {
      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const timeStr = date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const intensityInfo = INTENSITY_LABELS[item.intensity];

      return (
        <Pressable
          onPress={() => handleOpenDetail(item)}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <View className="bg-surface rounded-xl p-4 border border-border mb-3">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                {/* Date + badges row */}
                <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                  <Text className="text-base font-semibold text-foreground">
                    {dateStr}
                  </Text>
                  <View
                    style={{
                      backgroundColor: intensityInfo.color + "20",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ color: intensityInfo.color, fontSize: 11, fontWeight: "600" }}>
                      {intensityInfo.label}
                    </Text>
                  </View>
                  {item.wasManual && (
                    <View
                      style={{
                        backgroundColor: colors.primary + "20",
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>
                        Manuel
                      </Text>
                    </View>
                  )}
                  {!item.wasManual && item.sensorData && (
                    <View
                      style={{
                        backgroundColor: colors.success + "20",
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ color: colors.success, fontSize: 11, fontWeight: "600" }}>
                        Auto
                      </Text>
                    </View>
                  )}
                </View>

                {/* Time + Duration row */}
                <View className="flex-row items-center gap-3">
                  <Text className="text-sm text-muted">{timeStr}</Text>
                  {item.duration > 0 && (
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "500" }}>
                      {formatDuration(item.duration)}
                    </Text>
                  )}
                </View>

                {/* Sensor data summary */}
                {item.sensorData && (
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    <View style={{ backgroundColor: colors.warning + "12", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: colors.warning }}>
                        Confiance: {Math.round(item.sensorData.detectionConfidence * 100)}%
                      </Text>
                    </View>
                    {item.sensorData.avgHeartRate > 0 && (
                      <View style={{ backgroundColor: colors.error + "12", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.error }}>
                          FC: {item.sensorData.avgHeartRate} bpm
                        </Text>
                      </View>
                    )}
                    <View style={{ backgroundColor: colors.primary + "12", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: colors.primary }}>
                        {SOURCE_LABELS[item.sensorData.detectionSource] || item.sensorData.detectionSource}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Location badge */}
                {item.location && (
                  <Pressable
                    onPress={() => item.location?.googleMapsUrl && Linking.openURL(item.location.googleMapsUrl)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View className="flex-row items-center gap-1 mt-2">
                      <View style={{ backgroundColor: colors.success + "12", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.success }}>GPS</Text>
                        <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={1}>
                          {item.location.address || `${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}`}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                )}

                {/* Notes preview */}
                {item.notes ? (
                  <Text className="text-sm text-muted mt-2" numberOfLines={1}>
                    {item.notes}
                  </Text>
                ) : null}
              </View>

              {/* Action buttons */}
              <View className="flex-row gap-2 ml-2">
                <Pressable
                  onPress={() => {
                    setSelectedEvent(item);
                    setNotesText(item.notes);
                    setShowNotesModal(true);
                  }}
                  style={({ pressed }) => [
                    {
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: colors.primary }}>Notes</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteEvent(item.id)}
                  style={({ pressed }) => [
                    {
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: colors.error + "15",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: colors.error }}>Suppr.</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [colors, handleDeleteEvent, handleOpenDetail]
  );

  return (
    <ScreenContainer className="px-6">
      {/* Header */}
      <View className="flex-row justify-between items-center pt-4 mb-4">
        <Text className="text-2xl font-bold text-foreground">Journal</Text>
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

      {/* Stats Row 1 */}
      <View className="flex-row gap-3 mb-3">
        <View className="flex-1 bg-surface rounded-xl p-3 border border-border items-center">
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.primary }}>
            {stats.count}
          </Text>
          <Text className="text-xs text-muted mt-1">Crises</Text>
        </View>
        <View className="flex-1 bg-surface rounded-xl p-3 border border-border items-center">
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.primary }}>
            {formatDuration(stats.avgDuration)}
          </Text>
          <Text className="text-xs text-muted mt-1">Duree moy.</Text>
        </View>
        {stats.avgConfidence > 0 && (
          <View className="flex-1 bg-surface rounded-xl p-3 border border-border items-center">
            <Text style={{ fontSize: 24, fontWeight: "800", color: colors.primary }}>
              {stats.avgConfidence}%
            </Text>
            <Text className="text-xs text-muted mt-1">Confiance</Text>
          </View>
        )}
      </View>

      {/* Stats Row 2 - Intensity breakdown */}
      <View className="flex-row gap-2 mb-3">
        <View className="flex-1 bg-surface rounded-lg p-2 border border-border items-center">
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#22C55E" }}>
            {stats.lowCount}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Faible</Text>
        </View>
        <View className="flex-1 bg-surface rounded-lg p-2 border border-border items-center">
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#FF9100" }}>
            {stats.medCount}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Moyenne</Text>
        </View>
        <View className="flex-1 bg-surface rounded-lg p-2 border border-border items-center">
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#FF1744" }}>
            {stats.highCount}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Forte</Text>
        </View>
      </View>

      {/* Export button */}
      <Pressable
        onPress={handleExportReport}
        style={({ pressed }) => [
          {
            backgroundColor: colors.surface,
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.primary,
            marginBottom: 12,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
          Exporter le rapport medical
        </Text>
      </Pressable>

      {/* Filters */}
      <View className="flex-row gap-2 mb-4">
        {(Object.keys(FILTER_LABELS) as FilterPeriod[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: filter === key ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: filter === key ? colors.primary : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: filter === key ? "#FFFFFF" : colors.muted,
              }}
            >
              {FILTER_LABELS[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Events list */}
      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-base text-muted text-center">
              Aucune crise enregistree{"\n"}sur cette periode
            </Text>
          </View>
        }
      />

      {/* ===== DETAIL MODAL ===== */}
      <Modal visible={showDetailModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
              maxHeight: "85%",
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedEvent && (
                <>
                  {/* Header */}
                  <View className="flex-row justify-between items-center mb-4">
                    <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>
                      Detail de la crise
                    </Text>
                    <Pressable
                      onPress={() => { setShowDetailModal(false); setSelectedEvent(null); }}
                      style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={{ fontSize: 16, color: colors.muted }}>Fermer</Text>
                    </Pressable>
                  </View>

                  {/* Date & Time */}
                  <View className="bg-surface rounded-xl p-4 border border-border mb-3">
                    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Date et heure</Text>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
                      {new Date(selectedEvent.timestamp).toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>
                      {new Date(selectedEvent.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      {selectedEvent.endTimestamp && (
                        ` - ${new Date(selectedEvent.endTimestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                      )}
                    </Text>
                  </View>

                  {/* Duration & Intensity */}
                  <View className="flex-row gap-3 mb-3">
                    <View className="flex-1 bg-surface rounded-xl p-4 border border-border items-center">
                      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Duree</Text>
                      <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>
                        {formatDuration(selectedEvent.duration)}
                      </Text>
                    </View>
                    <View className="flex-1 bg-surface rounded-xl p-4 border border-border items-center">
                      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Intensite</Text>
                      <View style={{
                        backgroundColor: INTENSITY_LABELS[selectedEvent.intensity].color + "20",
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                      }}>
                        <Text style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: INTENSITY_LABELS[selectedEvent.intensity].color,
                        }}>
                          {INTENSITY_LABELS[selectedEvent.intensity].label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Detection type */}
                  <View className="bg-surface rounded-xl p-4 border border-border mb-3">
                    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Type de detection</Text>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                      {selectedEvent.wasManual ? "Saisie manuelle" : "Detection automatique"}
                    </Text>
                  </View>

                  {/* Sensor Data (if available) */}
                  {selectedEvent.sensorData && (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 8, marginTop: 4 }}>
                        Donnees des capteurs
                      </Text>

                      {/* Detection source & confidence */}
                      <View className="flex-row gap-3 mb-3">
                        <View className="flex-1 bg-surface rounded-xl p-4 border border-border items-center">
                          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Source</Text>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
                            {SOURCE_LABELS[selectedEvent.sensorData.detectionSource]}
                          </Text>
                        </View>
                        <View className="flex-1 bg-surface rounded-xl p-4 border border-border items-center">
                          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Confiance</Text>
                          <Text style={{
                            fontSize: 22,
                            fontWeight: "800",
                            color: selectedEvent.sensorData.detectionConfidence > 0.7
                              ? colors.success
                              : selectedEvent.sensorData.detectionConfidence > 0.4
                              ? colors.warning
                              : colors.error,
                          }}>
                            {Math.round(selectedEvent.sensorData.detectionConfidence * 100)}%
                          </Text>
                        </View>
                      </View>

                      {/* Acceleration data */}
                      <View className="bg-surface rounded-xl p-4 border border-border mb-3">
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                          Accelerometre
                        </Text>
                        <View className="flex-row justify-between mb-2">
                          <Text style={{ fontSize: 13, color: colors.muted }}>Acceleration max</Text>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                            {selectedEvent.sensorData.peakAcceleration.toFixed(2)} g
                          </Text>
                        </View>
                        <View className="flex-row justify-between mb-2">
                          <Text style={{ fontSize: 13, color: colors.muted }}>Acceleration moy.</Text>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                            {selectedEvent.sensorData.avgAcceleration.toFixed(2)} g
                          </Text>
                        </View>
                        <View className="flex-row justify-between mb-2">
                          <Text style={{ fontSize: 13, color: colors.muted }}>Gyroscope max</Text>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                            {selectedEvent.sensorData.peakGyroscope.toFixed(2)} rad/s
                          </Text>
                        </View>
                        <View className="flex-row justify-between">
                          <Text style={{ fontSize: 13, color: colors.muted }}>Ratio ROI (3-8 Hz)</Text>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                            {(selectedEvent.sensorData.roiPowerRatio * 100).toFixed(1)}%
                          </Text>
                        </View>
                      </View>

                      {/* Heart rate data (if available) */}
                      {selectedEvent.sensorData.avgHeartRate > 0 && (
                        <View className="bg-surface rounded-xl p-4 border border-border mb-3">
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                            Rythme cardiaque
                          </Text>
                          <View className="flex-row justify-between mb-2">
                            <Text style={{ fontSize: 13, color: colors.muted }}>FC moyenne</Text>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                              {selectedEvent.sensorData.avgHeartRate} bpm
                            </Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text style={{ fontSize: 13, color: colors.muted }}>FC max</Text>
                            <Text style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: selectedEvent.sensorData.peakHeartRate > 120 ? colors.error : colors.foreground,
                            }}>
                              {selectedEvent.sensorData.peakHeartRate} bpm
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}

                  {/* Location */}
                  {selectedEvent.location && (
                    <View className="bg-surface rounded-xl p-4 border border-border mb-3">
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                        Localisation GPS
                      </Text>
                      {selectedEvent.location.address && (
                        <View className="flex-row justify-between mb-2">
                          <Text style={{ fontSize: 13, color: colors.muted }}>Adresse</Text>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, maxWidth: "60%", textAlign: "right" }}>
                            {selectedEvent.location.address}
                          </Text>
                        </View>
                      )}
                      <View className="flex-row justify-between mb-2">
                        <Text style={{ fontSize: 13, color: colors.muted }}>Coordonnees</Text>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                          {selectedEvent.location.latitude.toFixed(5)}, {selectedEvent.location.longitude.toFixed(5)}
                        </Text>
                      </View>
                      {selectedEvent.location.accuracy && (
                        <View className="flex-row justify-between mb-3">
                          <Text style={{ fontSize: 13, color: colors.muted }}>Precision</Text>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                            ~{Math.round(selectedEvent.location.accuracy)}m
                          </Text>
                        </View>
                      )}
                      <Pressable
                        onPress={() => selectedEvent.location?.googleMapsUrl && Linking.openURL(selectedEvent.location.googleMapsUrl)}
                        style={({ pressed }) => [{
                          backgroundColor: colors.primary,
                          paddingVertical: 10,
                          borderRadius: 10,
                          alignItems: "center",
                          opacity: pressed ? 0.85 : 1,
                        }]}
                      >
                        <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13 }}>
                          Ouvrir dans Google Maps
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Notes */}
                  <View className="bg-surface rounded-xl p-4 border border-border mb-3">
                    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Notes</Text>
                    <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>
                      {selectedEvent.notes || "Aucune note"}
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== ADD MANUAL SEIZURE MODAL ===== */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 20 }}>
              Ajouter une crise
            </Text>

            {/* Intensity selector */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Intensite
            </Text>
            <View className="flex-row gap-2 mb-4">
              {(["low", "medium", "high"] as const).map((level) => (
                <Pressable
                  key={level}
                  onPress={() => setNewIntensity(level)}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: "center",
                      backgroundColor: newIntensity === level ? INTENSITY_LABELS[level].color : colors.surface,
                      borderWidth: 1,
                      borderColor: newIntensity === level ? INTENSITY_LABELS[level].color : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: newIntensity === level ? "#FFFFFF" : colors.muted,
                    }}
                  >
                    {INTENSITY_LABELS[level].label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Duration input */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Duree estimee (secondes)
            </Text>
            <TextInput
              value={newDuration}
              onChangeText={setNewDuration}
              placeholder="Ex: 45"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              returnKeyType="done"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 16,
              }}
            />

            {/* Notes input */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Notes (optionnel)
            </Text>
            <TextInput
              value={notesText}
              onChangeText={setNotesText}
              placeholder="Decrivez les circonstances..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                minHeight: 80,
                textAlignVertical: "top",
                marginBottom: 20,
              }}
            />

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  setShowAddModal(false);
                  setNotesText("");
                  setNewDuration("");
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
                <Text style={{ fontWeight: "600", color: colors.muted }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={handleAddManualSeizure}
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
                <Text style={{ fontWeight: "600", color: "#FFFFFF" }}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== NOTES MODAL ===== */}
      <Modal visible={showNotesModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 20 }}>
              Notes
            </Text>
            <TextInput
              value={notesText}
              onChangeText={setNotesText}
              placeholder="Ajoutez des notes..."
              placeholderTextColor={colors.muted}
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
                onPress={() => {
                  setShowNotesModal(false);
                  setSelectedEvent(null);
                  setNotesText("");
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
                <Text style={{ fontWeight: "600", color: colors.muted }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveNotes}
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
                <Text style={{ fontWeight: "600", color: "#FFFFFF" }}>Sauvegarder</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
