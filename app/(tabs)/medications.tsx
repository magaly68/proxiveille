import { useState, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  FlatList,
  TextInput,
  Switch,
  Modal,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import type { MedicationReminder, MedicationIntakeLog } from "@/lib/app-context";
import {
  scheduleMedicationNotifications,
  cancelMedicationNotifications,
  rescheduleMedicationNotifications,
  getScheduleDescription,
  MEDICATION_COLORS,
  getTodayString,
  getCurrentTimeString,
} from "@/lib/medication-reminder-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function formatTime(time: string): string {
  return time;
}

function getTodayIntakeLogs(
  logs: MedicationIntakeLog[],
  reminderId: string
): MedicationIntakeLog[] {
  const today = getTodayString();
  return logs.filter((l) => l.reminderId === reminderId && l.scheduledDate === today);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MedicationsScreen() {
  const colors = useColors();
  const { state, dispatch } = useAppState();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<MedicationReminder | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedReminderId, setSelectedReminderId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDosage, setFormDosage] = useState("");
  const [formTimes, setFormTimes] = useState<string[]>(["08:00"]);
  const [formDays, setFormDays] = useState<number[]>([]);
  const [formColor, setFormColor] = useState(MEDICATION_COLORS[0]);
  const [newTimeInput, setNewTimeInput] = useState("");

  // ── Form helpers ──────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormName("");
    setFormDosage("");
    setFormTimes(["08:00"]);
    setFormDays([]);
    setFormColor(MEDICATION_COLORS[0]);
    setNewTimeInput("");
    setEditingReminder(null);
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setShowAddModal(true);
  }, [resetForm]);

  const openEditModal = useCallback((reminder: MedicationReminder) => {
    setEditingReminder(reminder);
    setFormName(reminder.medicationName);
    setFormDosage(reminder.dosage);
    setFormTimes([...reminder.times]);
    setFormDays([...reminder.daysOfWeek]);
    setFormColor(reminder.color);
    setShowAddModal(true);
  }, []);

  const toggleDay = useCallback((day: number) => {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }, []);

  const addTime = useCallback(() => {
    const trimmed = newTimeInput.trim();
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(trimmed)) {
      Alert.alert("Format invalide", "Entrez l'heure au format HH:MM (ex: 08:00)");
      return;
    }
    if (formTimes.includes(trimmed)) {
      Alert.alert("Doublon", "Cette heure est déjà ajoutée.");
      return;
    }
    setFormTimes((prev) => [...prev, trimmed].sort());
    setNewTimeInput("");
  }, [newTimeInput, formTimes]);

  const removeTime = useCallback((time: string) => {
    setFormTimes((prev) => prev.filter((t) => t !== time));
  }, []);

  // ── Save reminder ─────────────────────────────────────────────────────────

  const saveReminder = useCallback(async () => {
    if (!formName.trim()) {
      Alert.alert("Nom requis", "Entrez le nom du médicament.");
      return;
    }
    if (formTimes.length === 0) {
      Alert.alert("Heure requise", "Ajoutez au moins une heure de prise.");
      return;
    }

    if (Platform.OS !== "web") {
      if (Haptics.impactAsync) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (editingReminder) {
      // Update existing
      const updated: MedicationReminder = {
        ...editingReminder,
        medicationName: formName.trim(),
        dosage: formDosage.trim(),
        times: formTimes,
        daysOfWeek: formDays,
        color: formColor,
        notificationIds: [],
      };
      const newIds = await rescheduleMedicationNotifications(updated);
      dispatch({
        type: "UPDATE_MEDICATION_REMINDER",
        payload: { ...updated, notificationIds: newIds },
      });
    } else {
      // Create new
      const newReminder: MedicationReminder = {
        id: Date.now().toString(),
        medicationName: formName.trim(),
        dosage: formDosage.trim(),
        times: formTimes,
        daysOfWeek: formDays,
        enabled: true,
        color: formColor,
        notificationIds: [],
        createdAt: Date.now(),
      };
      const ids = await scheduleMedicationNotifications(newReminder);
      dispatch({
        type: "ADD_MEDICATION_REMINDER",
        payload: { ...newReminder, notificationIds: ids },
      });
    }

    setShowAddModal(false);
    resetForm();
  }, [
    formName,
    formDosage,
    formTimes,
    formDays,
    formColor,
    editingReminder,
    dispatch,
    resetForm,
  ]);

  // ── Delete reminder ───────────────────────────────────────────────────────

  const deleteReminder = useCallback(
    (reminder: MedicationReminder) => {
      Alert.alert(
        "Supprimer le rappel",
        `Supprimer le rappel pour ${reminder.medicationName} ?`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: async () => {
              await cancelMedicationNotifications(reminder.notificationIds);
              dispatch({ type: "DELETE_MEDICATION_REMINDER", payload: reminder.id });
            },
          },
        ]
      );
    },
    [dispatch]
  );

  // ── Toggle reminder ───────────────────────────────────────────────────────

  const toggleReminder = useCallback(
    async (reminder: MedicationReminder) => {
      const updated: MedicationReminder = { ...reminder, enabled: !reminder.enabled };
      if (updated.enabled) {
        const ids = await scheduleMedicationNotifications(updated);
        dispatch({
          type: "UPDATE_MEDICATION_REMINDER",
          payload: { ...updated, notificationIds: ids },
        });
      } else {
        await cancelMedicationNotifications(reminder.notificationIds);
        dispatch({
          type: "UPDATE_MEDICATION_REMINDER",
          payload: { ...updated, notificationIds: [] },
        });
      }
    },
    [dispatch]
  );

  // ── Log intake ────────────────────────────────────────────────────────────

  const logIntake = useCallback(
    (reminder: MedicationReminder, time: string, status: "taken" | "skipped") => {
      const log: MedicationIntakeLog = {
        id: Date.now().toString(),
        reminderId: reminder.id,
        medicationName: reminder.medicationName,
        scheduledTime: time,
        scheduledDate: getTodayString(),
        timestamp: Date.now(),
        status,
      };
      dispatch({ type: "LOG_MEDICATION_INTAKE", payload: log });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          status === "taken"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning
        );
      }
    },
    [dispatch]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const todayLogs = state.medicationIntakeLogs.filter(
    (l) => l.scheduledDate === getTodayString()
  );
  const takenToday = todayLogs.filter((l) => l.status === "taken").length;
  const totalDosesToday = state.medicationReminders
    .filter((r) => r.enabled)
    .reduce((sum, r) => sum + r.times.length, 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View style={{ padding: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>
            Traitement
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
            Rappels et suivi de prise de médicaments
          </Text>
        </View>

        {/* Today summary */}
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 16,
            backgroundColor: colors.primary + "15",
            borderRadius: 16,
            padding: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text style={{ fontSize: 13, color: colors.muted }}>Aujourd'hui</Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.primary, marginTop: 2 }}>
              {takenToday} / {totalDosesToday}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>doses prises</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 36 }}>
              {totalDosesToday === 0 ? "💊" : takenToday === totalDosesToday ? "✅" : "⏰"}
            </Text>
          </View>
        </View>

        {/* Reminders list */}
        {state.medicationReminders.length === 0 ? (
          <View style={{ alignItems: "center", padding: 40 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>💊</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>
              Aucun rappel configuré
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
              Ajoutez vos médicaments pour recevoir des rappels automatiques
            </Text>
          </View>
        ) : (
          <FlatList
            data={state.medicationReminders}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            renderItem={({ item: reminder }) => {
              const todayLogsForReminder = getTodayIntakeLogs(
                state.medicationIntakeLogs,
                reminder.id
              );
              return (
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: 16,
                    borderLeftWidth: 4,
                    borderLeftColor: reminder.color,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {/* Header row */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                        {reminder.medicationName}
                      </Text>
                      {reminder.dosage ? (
                        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                          {reminder.dosage}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                        {getScheduleDescription(reminder)}
                      </Text>
                    </View>
                    <Switch
                      value={reminder.enabled}
                      onValueChange={() => toggleReminder(reminder)}
                      trackColor={{ false: colors.border, true: reminder.color + "80" }}
                      thumbColor={reminder.enabled ? reminder.color : colors.muted}
                    />
                  </View>

                  {/* Today's doses */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {reminder.times.map((time) => {
                      const log = todayLogsForReminder.find((l) => l.scheduledTime === time);
                      return (
                        <View
                          key={time}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor:
                              log?.status === "taken"
                                ? colors.success + "20"
                                : log?.status === "skipped"
                                ? colors.error + "20"
                                : colors.background,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderColor:
                              log?.status === "taken"
                                ? colors.success + "60"
                                : log?.status === "skipped"
                                ? colors.error + "60"
                                : colors.border,
                            gap: 6,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                            {formatTime(time)}
                          </Text>
                          {!log ? (
                            <>
                              <Pressable
                                onPress={() => logIntake(reminder, time, "taken")}
                                style={({ pressed }) => ({
                                  opacity: pressed ? 0.7 : 1,
                                  backgroundColor: colors.success + "30",
                                  borderRadius: 6,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                })}
                              >
                                <Text style={{ fontSize: 12, color: colors.success, fontWeight: "600" }}>
                                  Pris
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => logIntake(reminder, time, "skipped")}
                                style={({ pressed }) => ({
                                  opacity: pressed ? 0.7 : 1,
                                  backgroundColor: colors.error + "20",
                                  borderRadius: 6,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                })}
                              >
                                <Text style={{ fontSize: 12, color: colors.error, fontWeight: "600" }}>
                                  Sauté
                                </Text>
                              </Pressable>
                            </>
                          ) : (
                            <Text style={{ fontSize: 12, color: log.status === "taken" ? colors.success : colors.error }}>
                              {log.status === "taken" ? "✓ Pris" : "✗ Sauté"}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Actions */}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <Pressable
                      onPress={() => openEditModal(reminder)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.7 : 1,
                        flex: 1,
                        backgroundColor: colors.primary + "15",
                        borderRadius: 8,
                        paddingVertical: 8,
                        alignItems: "center",
                      })}
                    >
                      <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>
                        Modifier
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setSelectedReminderId(reminder.id);
                        setShowHistoryModal(true);
                      }}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.7 : 1,
                        flex: 1,
                        backgroundColor: colors.surface,
                        borderRadius: 8,
                        paddingVertical: 8,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: colors.border,
                      })}
                    >
                      <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>
                        Historique
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteReminder(reminder)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.7 : 1,
                        backgroundColor: colors.error + "15",
                        borderRadius: 8,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        alignItems: "center",
                      })}
                    >
                      <Text style={{ fontSize: 13, color: colors.error, fontWeight: "600" }}>
                        🗑
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Add button */}
        <Pressable
          onPress={openAddModal}
          style={({ pressed }) => ({
            opacity: pressed ? 0.85 : 1,
            marginHorizontal: 20,
            marginTop: 20,
            backgroundColor: colors.primary,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
          })}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>
            + Ajouter un médicament
          </Text>
        </Pressable>
      </ScrollView>

      {/* ── Add/Edit Modal ── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowAddModal(false); resetForm(); }}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Modal header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>
                {editingReminder ? "Modifier le rappel" : "Nouveau rappel"}
              </Text>
              <Pressable
                onPress={() => { setShowAddModal(false); resetForm(); }}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontSize: 16, color: colors.primary }}>Annuler</Text>
              </Pressable>
            </View>

            {/* Medication name */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Nom du médicament *
            </Text>
            <TextInput
              value={formName}
              onChangeText={setFormName}
              placeholder="Ex: Lévétiracétam"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 16,
              }}
            />

            {/* Dosage */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Dosage (optionnel)
            </Text>
            <TextInput
              value={formDosage}
              onChangeText={setFormDosage}
              placeholder="Ex: 500mg, 1 comprimé"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 16,
              }}
            />

            {/* Times */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Heures de prise *
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {formTimes.map((time) => (
                <View
                  key={time}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.primary + "20",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
                    {time}
                  </Text>
                  {formTimes.length > 1 && (
                    <Pressable onPress={() => removeTime(time)}>
                      <Text style={{ fontSize: 14, color: colors.error }}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <TextInput
                value={newTimeInput}
                onChangeText={setNewTimeInput}
                placeholder="HH:MM"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                onSubmitEditing={addTime}
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 15,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <Pressable
                onPress={addTime}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>+</Text>
              </Pressable>
            </View>

            {/* Days of week */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Jours (vide = tous les jours)
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 20 }}>
              {DAY_LABELS.map((label, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => toggleDay(idx)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    flex: 1,
                    backgroundColor: formDays.includes(idx) ? colors.primary : colors.surface,
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: formDays.includes(idx) ? colors.primary : colors.border,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: formDays.includes(idx) ? "#fff" : colors.muted,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Color picker */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
              Couleur
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
              {MEDICATION_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setFormColor(color)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: color,
                    borderWidth: formColor === color ? 3 : 0,
                    borderColor: colors.foreground,
                  })}
                />
              ))}
            </View>

            {/* Save button */}
            <Pressable
              onPress={saveReminder}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                backgroundColor: colors.primary,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>
                {editingReminder ? "Enregistrer" : "Ajouter le rappel"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Intake History Modal ── */}
      <Modal
        visible={showHistoryModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>
              Historique des prises
            </Text>
            <Pressable onPress={() => setShowHistoryModal(false)}>
              <Text style={{ fontSize: 16, color: colors.primary }}>Fermer</Text>
            </Pressable>
          </View>
          <FlatList
            data={state.medicationIntakeLogs
              .filter((l) => !selectedReminderId || l.reminderId === selectedReminderId)
              .slice(0, 100)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", padding: 40 }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>Aucune prise enregistrée</Text>
              </View>
            }
            renderItem={({ item: log }) => (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 8,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    {log.medicationName}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {log.scheduledDate} à {log.scheduledTime}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor:
                      log.status === "taken" ? colors.success + "20" : colors.error + "20",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: log.status === "taken" ? colors.success : colors.error,
                    }}
                  >
                    {log.status === "taken" ? "✓ Pris" : "✗ Sauté"}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      </Modal>
    </ScreenContainer>
  );
}
