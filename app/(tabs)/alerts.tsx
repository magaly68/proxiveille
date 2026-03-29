import { useState } from "react";
import {
  Text,
  View,
  FlatList,
  Modal,
  Pressable,
  Alert,
  Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import type { AlertHistoryEntry, AlertType, AlertStatus } from "@/lib/app-context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getAlertTypeLabel(type: AlertType): string {
  switch (type) {
    case "sms": return "SMS";
    case "call": return "Appel";
    case "sos": return "SOS";
    case "notification": return "Notification";
  }
}

function getAlertTypeIcon(type: AlertType): string {
  switch (type) {
    case "sms": return "💬";
    case "call": return "📞";
    case "sos": return "🆘";
    case "notification": return "🔔";
  }
}

function getTriggerLabel(trigger: AlertHistoryEntry["triggeredBy"]): string {
  switch (trigger) {
    case "auto_detection": return "Détection auto";
    case "sos_manual": return "SOS manuel";
    case "test": return "Test";
  }
}

function getStatusColor(status: AlertStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case "sent": return colors.success;
    case "failed": return colors.error;
    case "pending": return colors.warning;
    case "cancelled": return colors.muted;
  }
}

function getStatusLabel(status: AlertStatus): string {
  switch (status) {
    case "sent": return "Envoyé";
    case "failed": return "Échec";
    case "pending": return "En attente";
    case "cancelled": return "Annulé";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const colors = useColors();
  const { state, dispatch } = useAppState();

  const [selectedAlert, setSelectedAlert] = useState<AlertHistoryEntry | null>(null);
  const [filterType, setFilterType] = useState<AlertType | "all">("all");

  const filtered = state.alertHistory.filter(
    (a) => filterType === "all" || a.type === filterType
  );

  const totalSent = state.alertHistory.reduce((s, a) => s + a.totalSent, 0);
  const totalFailed = state.alertHistory.reduce((s, a) => s + a.totalFailed, 0);

  const handleClearHistory = () => {
    Alert.alert(
      "Effacer l'historique",
      "Supprimer tout l'historique des alertes envoyées ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Effacer",
          style: "destructive",
          onPress: () => dispatch({ type: "CLEAR_ALERT_HISTORY" }),
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ padding: 20, paddingBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>
            Historique alertes
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
            {state.alertHistory.length} alerte(s) enregistrée(s)
          </Text>
        </View>
        {state.alertHistory.length > 0 && (
          <Pressable
            onPress={handleClearHistory}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              backgroundColor: colors.error + "15",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            })}
          >
            <Text style={{ fontSize: 13, color: colors.error, fontWeight: "600" }}>Effacer</Text>
          </Pressable>
        )}
      </View>

      {/* Summary cards */}
      <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, marginBottom: 16 }}>
        <View style={{ flex: 1, backgroundColor: colors.success + "15", borderRadius: 12, padding: 14, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.success }}>{totalSent}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Envoyées</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.error + "15", borderRadius: 12, padding: 14, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.error }}>{totalFailed}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Échecs</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.primary + "15", borderRadius: 12, padding: 14, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.primary }}>{state.alertHistory.length}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Total</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
        {(["all", "sms", "call", "sos", "notification"] as const).map((type) => (
          <Pressable
            key={type}
            onPress={() => setFilterType(type)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              backgroundColor: filterType === type ? colors.primary : colors.surface,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: filterType === type ? colors.primary : colors.border,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: filterType === type ? "#fff" : colors.muted }}>
              {type === "all" ? "Tout" : getAlertTypeLabel(type)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🔕</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>
              Aucune alerte envoyée
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
              L'historique des alertes SMS, appels et SOS apparaîtra ici
            </Text>
          </View>
        }
        renderItem={({ item: alert }) => (
          <Pressable
            onPress={() => setSelectedAlert(alert)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <Text style={{ fontSize: 24 }}>{getAlertTypeIcon(alert.type)}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                      {getAlertTypeLabel(alert.type)}
                    </Text>
                    <View style={{
                      backgroundColor: alert.triggeredBy === "auto_detection"
                        ? colors.error + "20"
                        : alert.triggeredBy === "sos_manual"
                        ? colors.warning + "20"
                        : colors.primary + "20",
                      borderRadius: 6,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                    }}>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: alert.triggeredBy === "auto_detection"
                          ? colors.error
                          : alert.triggeredBy === "sos_manual"
                          ? colors.warning
                          : colors.primary,
                      }}>
                        {getTriggerLabel(alert.triggeredBy)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {formatDate(alert.timestamp)} à {formatTime(alert.timestamp)}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ fontSize: 12, color: colors.success, fontWeight: "600" }}>
                  ✓ {alert.totalSent}
                </Text>
                {alert.totalFailed > 0 && (
                  <Text style={{ fontSize: 12, color: colors.error, fontWeight: "600" }}>
                    ✗ {alert.totalFailed}
                  </Text>
                )}
              </View>
            </View>

            {/* Recipients preview */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {alert.recipients.slice(0, 3).map((r, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: getStatusColor(r.status, colors) + "15",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    gap: 4,
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: getStatusColor(r.status, colors) }} />
                  <Text style={{ fontSize: 11, color: colors.foreground, fontWeight: "500" }}>
                    {r.name}
                  </Text>
                </View>
              ))}
              {alert.recipients.length > 3 && (
                <Text style={{ fontSize: 11, color: colors.muted, paddingVertical: 3 }}>
                  +{alert.recipients.length - 3} autres
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />

      {/* ── Detail Modal ── */}
      <Modal
        visible={!!selectedAlert}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedAlert(null)}
      >
        {selectedAlert && (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={{ padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>
                {getAlertTypeIcon(selectedAlert.type)} Détail de l'alerte
              </Text>
              <Pressable onPress={() => setSelectedAlert(null)}>
                <Text style={{ fontSize: 16, color: colors.primary }}>Fermer</Text>
              </Pressable>
            </View>

            <FlatList
              data={selectedAlert.recipients}
              keyExtractor={(_, idx) => idx.toString()}
              contentContainerStyle={{ padding: 20, gap: 12 }}
              ListHeaderComponent={
                <View style={{ gap: 12, marginBottom: 8 }}>
                  {/* Info cards */}
                  <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: colors.muted }}>Type</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                        {getAlertTypeIcon(selectedAlert.type)} {getAlertTypeLabel(selectedAlert.type)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: colors.muted }}>Date</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                        {formatDate(selectedAlert.timestamp)} à {formatTime(selectedAlert.timestamp)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: colors.muted }}>Déclencheur</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                        {getTriggerLabel(selectedAlert.triggeredBy)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: colors.muted }}>Envoyés / Échecs</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                        <Text style={{ color: colors.success }}>{selectedAlert.totalSent} ✓</Text>
                        {selectedAlert.totalFailed > 0 && (
                          <Text style={{ color: colors.error }}> / {selectedAlert.totalFailed} ✗</Text>
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* Message */}
                  {selectedAlert.message && (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Message envoyé</Text>
                      <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>
                        {selectedAlert.message}
                      </Text>
                    </View>
                  )}

                  {/* Location */}
                  {selectedAlert.location && (
                    <Pressable
                      onPress={() => selectedAlert.location && Linking.openURL(selectedAlert.location)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.7 : 1,
                        backgroundColor: colors.primary + "15",
                        borderRadius: 14,
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        borderWidth: 1,
                        borderColor: colors.primary + "40",
                      })}
                    >
                      <Text style={{ fontSize: 20 }}>📍</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
                          Position GPS incluse
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                          Appuyer pour ouvrir dans Google Maps
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, color: colors.primary }}>›</Text>
                    </Pressable>
                  )}

                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                    Destinataires ({selectedAlert.recipients.length})
                  </Text>
                </View>
              }
              renderItem={({ item: recipient }) => (
                <View style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                      {recipient.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {recipient.phone}
                    </Text>
                    {recipient.error && (
                      <Text style={{ fontSize: 11, color: colors.error, marginTop: 2 }}>
                        Erreur : {recipient.error}
                      </Text>
                    )}
                  </View>
                  <View style={{
                    backgroundColor: getStatusColor(recipient.status, colors) + "20",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: getStatusColor(recipient.status, colors) }}>
                      {getStatusLabel(recipient.status)}
                    </Text>
                  </View>
                </View>
              )}
            />
          </View>
        )}
      </Modal>
    </ScreenContainer>
  );
}
