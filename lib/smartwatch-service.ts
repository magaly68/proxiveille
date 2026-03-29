/**
 * SmartWatch BLE Service
 * Handles Bluetooth Low Energy connection to smartwatches and wearables
 * for heart rate monitoring and enhanced seizure detection.
 *
 * Standard BLE Services used:
 * - Heart Rate Service: 0x180D
 *   - Heart Rate Measurement: 0x2A37 (notify)
 * - Device Information Service: 0x180A
 *   - Manufacturer Name: 0x2A29
 *   - Model Number: 0x2A24
 *   - Battery Level: 0x2A19
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// BLE Service UUIDs (standard Bluetooth SIG)
export const BLE_SERVICES = {
  HEART_RATE: "0000180d-0000-1000-8000-00805f9b34fb",
  DEVICE_INFO: "0000180a-0000-1000-8000-00805f9b34fb",
  BATTERY: "0000180f-0000-1000-8000-00805f9b34fb",
} as const;

// BLE Characteristic UUIDs
export const BLE_CHARACTERISTICS = {
  HEART_RATE_MEASUREMENT: "00002a37-0000-1000-8000-00805f9b34fb",
  MANUFACTURER_NAME: "00002a29-0000-1000-8000-00805f9b34fb",
  MODEL_NUMBER: "00002a24-0000-1000-8000-00805f9b34fb",
  BATTERY_LEVEL: "00002a19-0000-1000-8000-00805f9b34fb",
} as const;

// Storage keys
const PAIRED_DEVICE_KEY = "@epiguard_paired_device";

// Types
export interface BLEDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  isConnectable: boolean;
}

export interface PairedDevice {
  id: string;
  name: string;
  lastConnected: number;
}

export interface HeartRateData {
  bpm: number;
  timestamp: number;
  contactDetected: boolean;
  rrIntervals: number[]; // R-R intervals in ms
}

export interface SmartWatchState {
  isScanning: boolean;
  isConnected: boolean;
  connectedDevice: PairedDevice | null;
  discoveredDevices: BLEDevice[];
  heartRate: number;
  heartRateHistory: HeartRateData[];
  batteryLevel: number;
  lastHeartRateUpdate: number;
  error: string | null;
}

export const initialSmartWatchState: SmartWatchState = {
  isScanning: false,
  isConnected: false,
  connectedDevice: null,
  discoveredDevices: [],
  heartRate: 0,
  heartRateHistory: [],
  batteryLevel: -1,
  lastHeartRateUpdate: 0,
  error: null,
};

export type SmartWatchAction =
  | { type: "SET_SCANNING"; payload: boolean }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_DEVICE"; payload: PairedDevice | null }
  | { type: "ADD_DISCOVERED_DEVICE"; payload: BLEDevice }
  | { type: "CLEAR_DISCOVERED_DEVICES" }
  | { type: "SET_HEART_RATE"; payload: HeartRateData }
  | { type: "SET_BATTERY_LEVEL"; payload: number }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "RESET" };

export function smartWatchReducer(
  state: SmartWatchState,
  action: SmartWatchAction
): SmartWatchState {
  switch (action.type) {
    case "SET_SCANNING":
      return { ...state, isScanning: action.payload, error: null };
    case "SET_CONNECTED":
      return { ...state, isConnected: action.payload };
    case "SET_DEVICE":
      return { ...state, connectedDevice: action.payload };
    case "ADD_DISCOVERED_DEVICE": {
      const exists = state.discoveredDevices.some(
        (d) => d.id === action.payload.id
      );
      if (exists) {
        return {
          ...state,
          discoveredDevices: state.discoveredDevices.map((d) =>
            d.id === action.payload.id ? action.payload : d
          ),
        };
      }
      return {
        ...state,
        discoveredDevices: [...state.discoveredDevices, action.payload],
      };
    }
    case "CLEAR_DISCOVERED_DEVICES":
      return { ...state, discoveredDevices: [] };
    case "SET_HEART_RATE": {
      const history = [action.payload, ...state.heartRateHistory].slice(0, 300); // Keep last 5 min at 1Hz
      return {
        ...state,
        heartRate: action.payload.bpm,
        heartRateHistory: history,
        lastHeartRateUpdate: action.payload.timestamp,
      };
    }
    case "SET_BATTERY_LEVEL":
      return { ...state, batteryLevel: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload, isScanning: false };
    case "RESET":
      return initialSmartWatchState;
    default:
      return state;
  }
}

/**
 * Parse heart rate data from BLE characteristic value
 * According to Bluetooth SIG Heart Rate Measurement specification:
 * - Byte 0: Flags (bit 0 = format, bit 1 = contact status, bit 2 = contact supported, bit 4 = RR interval present)
 * - Byte 1 (or 1-2): Heart Rate Value
 * - Following bytes: RR Intervals (if present)
 */
export function parseHeartRateData(base64Value: string): HeartRateData | null {
  try {
    // Decode base64 to bytes
    const bytes = base64ToBytes(base64Value);
    if (bytes.length < 2) return null;

    const flags = bytes[0];
    const is16Bit = (flags & 0x01) !== 0;
    const contactDetected = (flags & 0x02) !== 0;
    const rrPresent = (flags & 0x10) !== 0;

    let bpm: number;
    let offset: number;

    if (is16Bit) {
      if (bytes.length < 3) return null;
      bpm = bytes[1] | (bytes[2] << 8);
      offset = 3;
    } else {
      bpm = bytes[1];
      offset = 2;
    }

    // Parse RR intervals if present
    const rrIntervals: number[] = [];
    if (rrPresent) {
      while (offset + 1 < bytes.length) {
        const rr = bytes[offset] | (bytes[offset + 1] << 8);
        // RR interval is in 1/1024 seconds, convert to ms
        rrIntervals.push(Math.round((rr / 1024) * 1000));
        offset += 2;
      }
    }

    return {
      bpm,
      timestamp: Date.now(),
      contactDetected,
      rrIntervals,
    };
  } catch {
    return null;
  }
}

/**
 * Decode base64 string to byte array
 */
function base64ToBytes(base64: string): number[] {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;

  for (const char of base64) {
    if (char === "=") break;
    const idx = chars.indexOf(char);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }

  return bytes;
}

/**
 * Save paired device to AsyncStorage for auto-reconnection
 */
export async function savePairedDevice(device: PairedDevice): Promise<void> {
  try {
    await AsyncStorage.setItem(PAIRED_DEVICE_KEY, JSON.stringify(device));
  } catch {
    // Silently fail
  }
}

/**
 * Load previously paired device from AsyncStorage
 */
export async function loadPairedDevice(): Promise<PairedDevice | null> {
  try {
    const data = await AsyncStorage.getItem(PAIRED_DEVICE_KEY);
    if (data) {
      return JSON.parse(data) as PairedDevice;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove paired device from AsyncStorage
 */
export async function removePairedDevice(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PAIRED_DEVICE_KEY);
  } catch {
    // Silently fail
  }
}

/**
 * Analyze heart rate data for seizure indicators
 * Returns a confidence score (0-1) based on:
 * - Sudden tachycardia (HR > 100 bpm, especially if resting was < 80)
 * - Heart rate variability changes (RR interval irregularity)
 * - Rapid HR increase (> 20 bpm in < 30 seconds)
 */
export function analyzeHeartRateForSeizure(
  history: HeartRateData[]
): {
  confidenceScore: number;
  isTachycardia: boolean;
  rapidIncrease: boolean;
  hrvAnomaly: boolean;
  averageBpm: number;
  currentBpm: number;
} {
  if (history.length < 5) {
    return {
      confidenceScore: 0,
      isTachycardia: false,
      rapidIncrease: false,
      hrvAnomaly: false,
      averageBpm: 0,
      currentBpm: history.length > 0 ? history[0].bpm : 0,
    };
  }

  const currentBpm = history[0].bpm;

  // Calculate baseline (average of last 2 minutes, excluding last 30s)
  const now = Date.now();
  const baselineData = history.filter(
    (d) => now - d.timestamp > 30000 && now - d.timestamp < 120000
  );
  const recentData = history.filter((d) => now - d.timestamp <= 30000);

  const baselineAvg =
    baselineData.length > 0
      ? baselineData.reduce((sum, d) => sum + d.bpm, 0) / baselineData.length
      : 70; // Default resting HR

  const recentAvg =
    recentData.length > 0
      ? recentData.reduce((sum, d) => sum + d.bpm, 0) / recentData.length
      : currentBpm;

  // Check tachycardia (HR > 100 bpm)
  const isTachycardia = currentBpm > 100;

  // Check rapid increase (> 20 bpm increase in 30s)
  const rapidIncrease = recentAvg - baselineAvg > 20;

  // Check HRV anomaly using RR intervals
  let hrvAnomaly = false;
  const recentRR = recentData.flatMap((d) => d.rrIntervals);
  if (recentRR.length >= 5) {
    const rrMean = recentRR.reduce((s, v) => s + v, 0) / recentRR.length;
    const rrStd = Math.sqrt(
      recentRR.reduce((s, v) => s + Math.pow(v - rrMean, 2), 0) /
        recentRR.length
    );
    // High variability coefficient suggests anomaly
    const cv = rrStd / rrMean;
    hrvAnomaly = cv > 0.15; // Coefficient of variation > 15%
  }

  // Calculate confidence score
  let score = 0;
  if (isTachycardia) score += 0.35;
  if (rapidIncrease) score += 0.35;
  if (hrvAnomaly) score += 0.3;

  // Bonus if multiple indicators present
  const indicatorCount = [isTachycardia, rapidIncrease, hrvAnomaly].filter(
    Boolean
  ).length;
  if (indicatorCount >= 2) score = Math.min(score * 1.2, 1.0);

  return {
    confidenceScore: Math.min(score, 1.0),
    isTachycardia,
    rapidIncrease,
    hrvAnomaly,
    averageBpm: Math.round(baselineAvg),
    currentBpm,
  };
}

/**
 * Check if BLE is available on the current platform
 */
export function isBLEAvailable(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}
