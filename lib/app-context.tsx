import React, { createContext, useContext, useReducer, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeizureEvent {
  id: string;
  timestamp: number;
  endTimestamp?: number;
  duration: number;
  intensity: "low" | "medium" | "high";
  notes: string;
  wasManual: boolean;
  wasCancelled: boolean;
  sensorData?: {
    peakAcceleration: number;
    avgAcceleration: number;
    peakGyroscope: number;
    avgHeartRate: number;
    peakHeartRate: number;
    detectionConfidence: number;
    detectionSource: "phone" | "watch" | "combined";
    roiPowerRatio: number;
  };
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    address: string | null;
    googleMapsUrl: string;
  };
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

export interface MedicalProfile {
  name: string;
  age: string;
  bloodType: string;
  epilepsyType: string;
  medications: string;
  allergies: string;
  doctor: string;
  doctorPhone: string;
}

export interface DetectionSettings {
  sensitivity: "low" | "medium" | "high";
  thresholdDuration: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  autoCallEnabled: boolean;
  alertMessage: string;
}

// ─── Medication Reminder ──────────────────────────────────────────────────────

export interface MedicationReminder {
  id: string;
  medicationName: string;
  dosage: string;
  times: string[]; // e.g. ["08:00", "20:00"]
  daysOfWeek: number[]; // 0=Sun … 6=Sat, empty = every day
  enabled: boolean;
  color: string; // hex colour for visual distinction
  notificationIds: string[]; // expo notification IDs for cancellation
  createdAt: number;
}

export interface MedicationIntakeLog {
  id: string;
  reminderId: string;
  medicationName: string;
  scheduledTime: string; // "HH:MM"
  scheduledDate: string; // "YYYY-MM-DD"
  timestamp: number;
  status: "taken" | "skipped" | "snoozed";
  notes?: string;
}

// ─── Alert History ────────────────────────────────────────────────────────────

export type AlertType = "sms" | "call" | "sos" | "notification";
export type AlertStatus = "sent" | "failed" | "pending" | "cancelled";

export interface AlertHistoryEntry {
  id: string;
  timestamp: number;
  type: AlertType;
  seizureId?: string; // linked seizure if triggered by detection
  recipients: {
    name: string;
    phone: string;
    status: AlertStatus;
    error?: string;
  }[];
  message?: string;
  location?: string; // Google Maps URL if GPS was available
  triggeredBy: "auto_detection" | "sos_manual" | "test";
  totalSent: number;
  totalFailed: number;
}

// ─── Night Mode ───────────────────────────────────────────────────────────────

export interface NightModeSettings {
  enabled: boolean;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  autoActivate: boolean; // auto-enable between startTime and endTime
  keepScreenOn: boolean;
  reducedBrightness: boolean;
  simplifiedUI: boolean; // show only the big status indicator
}

// ─── App State ────────────────────────────────────────────────────────────────

export type MonitoringStatus = "inactive" | "active" | "warning" | "alarm";

export interface AppState {
  monitoringStatus: MonitoringStatus;
  isMonitoring: boolean;
  seizureEvents: SeizureEvent[];
  emergencyContacts: EmergencyContact[];
  medicalProfile: MedicalProfile;
  detectionSettings: DetectionSettings;
  countdownActive: boolean;
  countdownSeconds: number;
  alarmStartTimestamp: number | null;
  currentAlarmSensorData: {
    peakAcceleration: number;
    avgAcceleration: number;
    accelSamples: number;
    peakGyroscope: number;
    avgHeartRate: number;
    peakHeartRate: number;
    hrSamples: number;
    detectionConfidence: number;
    detectionSource: "phone" | "watch" | "combined";
    roiPowerRatio: number;
  } | null;
  // New features
  medicationReminders: MedicationReminder[];
  medicationIntakeLogs: MedicationIntakeLog[];
  alertHistory: AlertHistoryEntry[];
  nightModeSettings: NightModeSettings;
  isNightModeActive: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defaultMedicalProfile: MedicalProfile = {
  name: "",
  age: "",
  bloodType: "",
  epilepsyType: "",
  medications: "",
  allergies: "",
  doctor: "",
  doctorPhone: "",
};

const defaultDetectionSettings: DetectionSettings = {
  sensitivity: "medium",
  thresholdDuration: 10,
  soundEnabled: true,
  vibrationEnabled: true,
  autoCallEnabled: false,
  alertMessage:
    "Une crise d'epilepsie a ete detectee. Veuillez contacter cette personne ou les services d'urgence.",
};

const defaultNightModeSettings: NightModeSettings = {
  enabled: false,
  startTime: "22:00",
  endTime: "07:00",
  autoActivate: true,
  keepScreenOn: true,
  reducedBrightness: true,
  simplifiedUI: true,
};

const initialState: AppState = {
  monitoringStatus: "inactive",
  isMonitoring: false,
  seizureEvents: [],
  emergencyContacts: [],
  medicalProfile: defaultMedicalProfile,
  detectionSettings: defaultDetectionSettings,
  countdownActive: false,
  countdownSeconds: 30,
  alarmStartTimestamp: null,
  currentAlarmSensorData: null,
  medicationReminders: [],
  medicationIntakeLogs: [],
  alertHistory: [],
  nightModeSettings: defaultNightModeSettings,
  isNightModeActive: false,
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "SET_MONITORING"; payload: boolean }
  | { type: "SET_STATUS"; payload: MonitoringStatus }
  | { type: "ADD_SEIZURE"; payload: SeizureEvent }
  | { type: "UPDATE_SEIZURE_NOTES"; payload: { id: string; notes: string } }
  | { type: "DELETE_SEIZURE"; payload: string }
  | { type: "ADD_CONTACT"; payload: EmergencyContact }
  | { type: "REMOVE_CONTACT"; payload: string }
  | { type: "UPDATE_PROFILE"; payload: Partial<MedicalProfile> }
  | { type: "UPDATE_SETTINGS"; payload: Partial<DetectionSettings> }
  | { type: "SET_COUNTDOWN"; payload: { active: boolean; seconds: number } }
  | { type: "START_ALARM_TRACKING"; payload: { timestamp: number; sensorData: NonNullable<AppState["currentAlarmSensorData"]> } }
  | { type: "UPDATE_ALARM_SENSOR_DATA"; payload: Partial<NonNullable<AppState["currentAlarmSensorData"]>> }
  | { type: "CLEAR_ALARM_TRACKING" }
  | { type: "UPDATE_SEIZURE_LOCATION"; payload: { seizureId: string; location: NonNullable<SeizureEvent["location"]> } }
  // Medication reminders
  | { type: "ADD_MEDICATION_REMINDER"; payload: MedicationReminder }
  | { type: "UPDATE_MEDICATION_REMINDER"; payload: MedicationReminder }
  | { type: "DELETE_MEDICATION_REMINDER"; payload: string }
  | { type: "TOGGLE_MEDICATION_REMINDER"; payload: string }
  | { type: "LOG_MEDICATION_INTAKE"; payload: MedicationIntakeLog }
  // Alert history
  | { type: "ADD_ALERT_HISTORY"; payload: AlertHistoryEntry }
  | { type: "CLEAR_ALERT_HISTORY" }
  // Night mode
  | { type: "UPDATE_NIGHT_MODE_SETTINGS"; payload: Partial<NightModeSettings> }
  | { type: "SET_NIGHT_MODE_ACTIVE"; payload: boolean }
  | { type: "LOAD_STATE"; payload: Partial<AppState> };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_MONITORING":
      return {
        ...state,
        isMonitoring: action.payload,
        monitoringStatus: action.payload ? "active" : "inactive",
      };
    case "SET_STATUS":
      return { ...state, monitoringStatus: action.payload };
    case "ADD_SEIZURE":
      return { ...state, seizureEvents: [action.payload, ...state.seizureEvents] };
    case "UPDATE_SEIZURE_NOTES":
      return {
        ...state,
        seizureEvents: state.seizureEvents.map((e) =>
          e.id === action.payload.id ? { ...e, notes: action.payload.notes } : e
        ),
      };
    case "DELETE_SEIZURE":
      return {
        ...state,
        seizureEvents: state.seizureEvents.filter((e) => e.id !== action.payload),
      };
    case "ADD_CONTACT":
      return { ...state, emergencyContacts: [...state.emergencyContacts, action.payload] };
    case "REMOVE_CONTACT":
      return {
        ...state,
        emergencyContacts: state.emergencyContacts.filter((c) => c.id !== action.payload),
      };
    case "UPDATE_PROFILE":
      return { ...state, medicalProfile: { ...state.medicalProfile, ...action.payload } };
    case "UPDATE_SETTINGS":
      return { ...state, detectionSettings: { ...state.detectionSettings, ...action.payload } };
    case "SET_COUNTDOWN":
      return {
        ...state,
        countdownActive: action.payload.active,
        countdownSeconds: action.payload.seconds,
      };
    case "START_ALARM_TRACKING":
      return {
        ...state,
        alarmStartTimestamp: action.payload.timestamp,
        currentAlarmSensorData: action.payload.sensorData,
      };
    case "UPDATE_ALARM_SENSOR_DATA":
      if (!state.currentAlarmSensorData) return state;
      return {
        ...state,
        currentAlarmSensorData: { ...state.currentAlarmSensorData, ...action.payload },
      };
    case "CLEAR_ALARM_TRACKING":
      return { ...state, alarmStartTimestamp: null, currentAlarmSensorData: null };
    case "UPDATE_SEIZURE_LOCATION":
      return {
        ...state,
        seizureEvents: state.seizureEvents.map((e) =>
          e.id === action.payload.seizureId ? { ...e, location: action.payload.location } : e
        ),
      };

    // ── Medication reminders ──
    case "ADD_MEDICATION_REMINDER":
      return {
        ...state,
        medicationReminders: [...state.medicationReminders, action.payload],
      };
    case "UPDATE_MEDICATION_REMINDER":
      return {
        ...state,
        medicationReminders: state.medicationReminders.map((r) =>
          r.id === action.payload.id ? action.payload : r
        ),
      };
    case "DELETE_MEDICATION_REMINDER":
      return {
        ...state,
        medicationReminders: state.medicationReminders.filter((r) => r.id !== action.payload),
      };
    case "TOGGLE_MEDICATION_REMINDER":
      return {
        ...state,
        medicationReminders: state.medicationReminders.map((r) =>
          r.id === action.payload ? { ...r, enabled: !r.enabled } : r
        ),
      };
    case "LOG_MEDICATION_INTAKE":
      return {
        ...state,
        medicationIntakeLogs: [action.payload, ...state.medicationIntakeLogs].slice(0, 500),
      };

    // ── Alert history ──
    case "ADD_ALERT_HISTORY":
      return {
        ...state,
        alertHistory: [action.payload, ...state.alertHistory].slice(0, 200),
      };
    case "CLEAR_ALERT_HISTORY":
      return { ...state, alertHistory: [] };

    // ── Night mode ──
    case "UPDATE_NIGHT_MODE_SETTINGS":
      return {
        ...state,
        nightModeSettings: { ...state.nightModeSettings, ...action.payload },
      };
    case "SET_NIGHT_MODE_ACTIVE":
      return { ...state, isNightModeActive: action.payload };

    case "LOAD_STATE":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextType>({
  state: initialState,
  dispatch: () => {},
});

const STORAGE_KEY = "@epiguard_state";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load persisted state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          dispatch({
            type: "LOAD_STATE",
            payload: {
              seizureEvents: parsed.seizureEvents || [],
              emergencyContacts: parsed.emergencyContacts || [],
              medicalProfile: parsed.medicalProfile || defaultMedicalProfile,
              detectionSettings: parsed.detectionSettings || defaultDetectionSettings,
              medicationReminders: parsed.medicationReminders || [],
              medicationIntakeLogs: parsed.medicationIntakeLogs || [],
              alertHistory: parsed.alertHistory || [],
              nightModeSettings: parsed.nightModeSettings || defaultNightModeSettings,
            },
          });
        }
      } catch (e) {
        console.warn("Failed to load state:", e);
      }
    };
    loadState();
  }, []);

  // Persist state on changes
  useEffect(() => {
    const saveState = async () => {
      try {
        const toSave = {
          seizureEvents: state.seizureEvents,
          emergencyContacts: state.emergencyContacts,
          medicalProfile: state.medicalProfile,
          detectionSettings: state.detectionSettings,
          medicationReminders: state.medicationReminders,
          medicationIntakeLogs: state.medicationIntakeLogs,
          alertHistory: state.alertHistory,
          nightModeSettings: state.nightModeSettings,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch (e) {
        console.warn("Failed to save state:", e);
      }
    };
    saveState();
  }, [
    state.seizureEvents,
    state.emergencyContacts,
    state.medicalProfile,
    state.detectionSettings,
    state.medicationReminders,
    state.medicationIntakeLogs,
    state.alertHistory,
    state.nightModeSettings,
  ]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppContext);
}
