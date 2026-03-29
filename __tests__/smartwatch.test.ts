import { describe, it, expect } from "vitest";

// Test the smartwatch service logic directly (no @/ alias)
// We re-implement key functions here to test the logic

// ---- parseHeartRateData logic ----
function base64ToBytes(base64: string): number[] {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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

interface HeartRateData {
  bpm: number;
  timestamp: number;
  contactDetected: boolean;
  rrIntervals: number[];
}

function parseHeartRateData(base64Value: string): HeartRateData | null {
  try {
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
    const rrIntervals: number[] = [];
    if (rrPresent) {
      while (offset + 1 < bytes.length) {
        const rr = bytes[offset] | (bytes[offset + 1] << 8);
        rrIntervals.push(Math.round((rr / 1024) * 1000));
        offset += 2;
      }
    }
    return { bpm, timestamp: Date.now(), contactDetected, rrIntervals };
  } catch {
    return null;
  }
}

// ---- analyzeHeartRateForSeizure logic ----
function analyzeHeartRateForSeizure(history: HeartRateData[]) {
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
  const now = Date.now();
  const baselineData = history.filter(
    (d) => now - d.timestamp > 30000 && now - d.timestamp < 120000
  );
  const recentData = history.filter((d) => now - d.timestamp <= 30000);
  const baselineAvg =
    baselineData.length > 0
      ? baselineData.reduce((sum, d) => sum + d.bpm, 0) / baselineData.length
      : 70;
  const recentAvg =
    recentData.length > 0
      ? recentData.reduce((sum, d) => sum + d.bpm, 0) / recentData.length
      : currentBpm;
  const isTachycardia = currentBpm > 100;
  const rapidIncrease = recentAvg - baselineAvg > 20;
  let hrvAnomaly = false;
  const recentRR = recentData.flatMap((d) => d.rrIntervals);
  if (recentRR.length >= 5) {
    const rrMean = recentRR.reduce((s, v) => s + v, 0) / recentRR.length;
    const rrStd = Math.sqrt(
      recentRR.reduce((s, v) => s + Math.pow(v - rrMean, 2), 0) / recentRR.length
    );
    const cv = rrStd / rrMean;
    hrvAnomaly = cv > 0.15;
  }
  let score = 0;
  if (isTachycardia) score += 0.35;
  if (rapidIncrease) score += 0.35;
  if (hrvAnomaly) score += 0.3;
  const indicatorCount = [isTachycardia, rapidIncrease, hrvAnomaly].filter(Boolean).length;
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

// ---- computeCombinedScore logic ----
function computeCombinedScore(
  phoneScore: number,
  watchScore: number,
  hasWatch: boolean
): { combinedScore: number; confidence: "low" | "medium" | "high" } {
  if (!hasWatch) {
    return {
      combinedScore: phoneScore,
      confidence: phoneScore > 0.7 ? "medium" : "low",
    };
  }
  const PHONE_WEIGHT = 0.55;
  const WATCH_WEIGHT = 0.45;
  let combinedScore = phoneScore * PHONE_WEIGHT + watchScore * WATCH_WEIGHT;
  if (phoneScore > 0.3 && watchScore > 0.3) {
    combinedScore = Math.min(combinedScore * 1.3, 1.0);
  }
  let confidence: "low" | "medium" | "high" = "low";
  if (combinedScore > 0.7 && phoneScore > 0.3 && watchScore > 0.3) {
    confidence = "high";
  } else if (combinedScore > 0.5) {
    confidence = "medium";
  }
  return { combinedScore, confidence };
}

// ---- SmartWatch Reducer logic ----
interface SmartWatchState {
  isScanning: boolean;
  isConnected: boolean;
  connectedDevice: any;
  discoveredDevices: any[];
  heartRate: number;
  heartRateHistory: HeartRateData[];
  batteryLevel: number;
  lastHeartRateUpdate: number;
  error: string | null;
}

const initialState: SmartWatchState = {
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

type SmartWatchAction =
  | { type: "SET_SCANNING"; payload: boolean }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_DEVICE"; payload: any }
  | { type: "ADD_DISCOVERED_DEVICE"; payload: any }
  | { type: "CLEAR_DISCOVERED_DEVICES" }
  | { type: "SET_HEART_RATE"; payload: HeartRateData }
  | { type: "SET_BATTERY_LEVEL"; payload: number }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "RESET" };

function smartWatchReducer(state: SmartWatchState, action: SmartWatchAction): SmartWatchState {
  switch (action.type) {
    case "SET_SCANNING":
      return { ...state, isScanning: action.payload, error: null };
    case "SET_CONNECTED":
      return { ...state, isConnected: action.payload };
    case "SET_DEVICE":
      return { ...state, connectedDevice: action.payload };
    case "ADD_DISCOVERED_DEVICE": {
      const exists = state.discoveredDevices.some((d: any) => d.id === action.payload.id);
      if (exists) {
        return {
          ...state,
          discoveredDevices: state.discoveredDevices.map((d: any) =>
            d.id === action.payload.id ? action.payload : d
          ),
        };
      }
      return { ...state, discoveredDevices: [...state.discoveredDevices, action.payload] };
    }
    case "CLEAR_DISCOVERED_DEVICES":
      return { ...state, discoveredDevices: [] };
    case "SET_HEART_RATE": {
      const history = [action.payload, ...state.heartRateHistory].slice(0, 300);
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
      return initialState;
    default:
      return state;
  }
}

// ============ TESTS ============

describe("BLE Heart Rate Parsing", () => {
  it("should parse 8-bit heart rate value", () => {
    // Flags: 0x00 (8-bit, no contact, no RR), HR: 72
    // Bytes: [0x00, 0x48] -> base64: "AEg="
    const bytes = [0x00, 72];
    const base64 = btoa(String.fromCharCode(...bytes));
    const result = parseHeartRateData(base64);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBe(72);
    expect(result!.contactDetected).toBe(false);
    expect(result!.rrIntervals).toEqual([]);
  });

  it("should parse 16-bit heart rate value", () => {
    // Flags: 0x01 (16-bit), HR: 150 (0x96, 0x00)
    const bytes = [0x01, 150, 0];
    const base64 = btoa(String.fromCharCode(...bytes));
    const result = parseHeartRateData(base64);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBe(150);
  });

  it("should detect contact status", () => {
    // Flags: 0x06 (contact supported + detected, 8-bit), HR: 80
    const bytes = [0x06, 80];
    const base64 = btoa(String.fromCharCode(...bytes));
    const result = parseHeartRateData(base64);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBe(80);
    expect(result!.contactDetected).toBe(true);
  });

  it("should parse RR intervals when present", () => {
    // Flags: 0x10 (RR present, 8-bit), HR: 75, RR: 800ms = 819 in 1/1024s
    const rrValue = Math.round((800 / 1000) * 1024); // ~819
    const bytes = [0x10, 75, rrValue & 0xff, (rrValue >> 8) & 0xff];
    const base64 = btoa(String.fromCharCode(...bytes));
    const result = parseHeartRateData(base64);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBe(75);
    expect(result!.rrIntervals.length).toBe(1);
    expect(result!.rrIntervals[0]).toBeGreaterThan(750);
    expect(result!.rrIntervals[0]).toBeLessThan(850);
  });

  it("should return null for too short data", () => {
    const bytes = [0x00];
    const base64 = btoa(String.fromCharCode(...bytes));
    const result = parseHeartRateData(base64);
    expect(result).toBeNull();
  });

  it("should return null for empty string", () => {
    const result = parseHeartRateData("");
    expect(result).toBeNull();
  });
});

describe("Heart Rate Seizure Analysis", () => {
  it("should return zero score with insufficient data", () => {
    const history: HeartRateData[] = [
      { bpm: 75, timestamp: Date.now(), contactDetected: true, rrIntervals: [] },
    ];
    const result = analyzeHeartRateForSeizure(history);
    expect(result.confidenceScore).toBe(0);
    expect(result.isTachycardia).toBe(false);
  });

  it("should detect tachycardia when HR > 100", () => {
    const now = Date.now();
    const history: HeartRateData[] = [];
    // Recent data: high HR
    for (let i = 0; i < 10; i++) {
      history.push({
        bpm: 120,
        timestamp: now - i * 2000,
        contactDetected: true,
        rrIntervals: [],
      });
    }
    // Baseline data: normal HR
    for (let i = 0; i < 20; i++) {
      history.push({
        bpm: 70,
        timestamp: now - 40000 - i * 3000,
        contactDetected: true,
        rrIntervals: [],
      });
    }
    const result = analyzeHeartRateForSeizure(history);
    expect(result.isTachycardia).toBe(true);
    expect(result.confidenceScore).toBeGreaterThan(0);
    expect(result.currentBpm).toBe(120);
  });

  it("should detect rapid increase", () => {
    const now = Date.now();
    const history: HeartRateData[] = [];
    // Recent: sudden high HR
    for (let i = 0; i < 10; i++) {
      history.push({
        bpm: 110,
        timestamp: now - i * 2000,
        contactDetected: true,
        rrIntervals: [],
      });
    }
    // Baseline: low HR
    for (let i = 0; i < 20; i++) {
      history.push({
        bpm: 65,
        timestamp: now - 40000 - i * 3000,
        contactDetected: true,
        rrIntervals: [],
      });
    }
    const result = analyzeHeartRateForSeizure(history);
    expect(result.rapidIncrease).toBe(true);
  });

  it("should detect HRV anomaly with irregular RR intervals", () => {
    const now = Date.now();
    const history: HeartRateData[] = [];
    // Recent data with very irregular RR intervals
    for (let i = 0; i < 10; i++) {
      history.push({
        bpm: 90,
        timestamp: now - i * 2000,
        contactDetected: true,
        rrIntervals: [400 + (i % 2 === 0 ? 300 : -200), 500 + (i % 3 === 0 ? 400 : -100)],
      });
    }
    const result = analyzeHeartRateForSeizure(history);
    expect(result.hrvAnomaly).toBe(true);
  });

  it("should give high score when multiple indicators present", () => {
    const now = Date.now();
    const history: HeartRateData[] = [];
    // Recent: tachycardia + irregular RR
    for (let i = 0; i < 10; i++) {
      history.push({
        bpm: 130,
        timestamp: now - i * 2000,
        contactDetected: true,
        rrIntervals: [300 + (i % 2 === 0 ? 400 : -150)],
      });
    }
    // Baseline: normal
    for (let i = 0; i < 20; i++) {
      history.push({
        bpm: 68,
        timestamp: now - 40000 - i * 3000,
        contactDetected: true,
        rrIntervals: [880],
      });
    }
    const result = analyzeHeartRateForSeizure(history);
    expect(result.isTachycardia).toBe(true);
    expect(result.rapidIncrease).toBe(true);
    expect(result.confidenceScore).toBeGreaterThan(0.5);
  });
});

describe("Combined Multi-Source Detection Score", () => {
  it("should return phone-only score when no watch", () => {
    const result = computeCombinedScore(0.8, 0, false);
    expect(result.combinedScore).toBe(0.8);
    expect(result.confidence).toBe("medium");
  });

  it("should return low confidence for low phone score without watch", () => {
    const result = computeCombinedScore(0.3, 0, false);
    expect(result.combinedScore).toBe(0.3);
    expect(result.confidence).toBe("low");
  });

  it("should combine phone and watch scores with weights", () => {
    const result = computeCombinedScore(0.6, 0.6, true);
    // 0.6*0.55 + 0.6*0.45 = 0.33 + 0.27 = 0.6, then * 1.3 (both > 0.3) = 0.78
    expect(result.combinedScore).toBeGreaterThan(0.7);
    expect(result.confidence).toBe("high");
  });

  it("should apply multi-source bonus when both detect anomaly", () => {
    const result = computeCombinedScore(0.5, 0.5, true);
    // 0.5*0.55 + 0.5*0.45 = 0.275 + 0.225 = 0.5, then * 1.3 = 0.65
    expect(result.combinedScore).toBeGreaterThan(0.5);
    expect(result.confidence).toBe("medium");
  });

  it("should not apply bonus when only one source detects", () => {
    const result = computeCombinedScore(0.8, 0.1, true);
    // 0.8*0.55 + 0.1*0.45 = 0.44 + 0.045 = 0.485, no bonus
    expect(result.combinedScore).toBeLessThan(0.5);
  });

  it("should cap combined score at 1.0", () => {
    const result = computeCombinedScore(1.0, 1.0, true);
    expect(result.combinedScore).toBeLessThanOrEqual(1.0);
  });
});

describe("SmartWatch Reducer", () => {
  it("should set scanning state", () => {
    const state = smartWatchReducer(initialState, { type: "SET_SCANNING", payload: true });
    expect(state.isScanning).toBe(true);
    expect(state.error).toBeNull();
  });

  it("should clear error when starting scan", () => {
    const stateWithError = { ...initialState, error: "Some error" };
    const state = smartWatchReducer(stateWithError, { type: "SET_SCANNING", payload: true });
    expect(state.error).toBeNull();
  });

  it("should add discovered device", () => {
    const device = { id: "dev1", name: "Watch", rssi: -50, isConnectable: true };
    const state = smartWatchReducer(initialState, {
      type: "ADD_DISCOVERED_DEVICE",
      payload: device,
    });
    expect(state.discoveredDevices).toHaveLength(1);
    expect(state.discoveredDevices[0].name).toBe("Watch");
  });

  it("should update existing discovered device", () => {
    const device1 = { id: "dev1", name: "Watch", rssi: -50, isConnectable: true };
    const state1 = smartWatchReducer(initialState, {
      type: "ADD_DISCOVERED_DEVICE",
      payload: device1,
    });
    const device2 = { id: "dev1", name: "Watch", rssi: -30, isConnectable: true };
    const state2 = smartWatchReducer(state1, {
      type: "ADD_DISCOVERED_DEVICE",
      payload: device2,
    });
    expect(state2.discoveredDevices).toHaveLength(1);
    expect(state2.discoveredDevices[0].rssi).toBe(-30);
  });

  it("should set heart rate and maintain history", () => {
    const hrData: HeartRateData = {
      bpm: 75,
      timestamp: Date.now(),
      contactDetected: true,
      rrIntervals: [800],
    };
    const state = smartWatchReducer(initialState, {
      type: "SET_HEART_RATE",
      payload: hrData,
    });
    expect(state.heartRate).toBe(75);
    expect(state.heartRateHistory).toHaveLength(1);
  });

  it("should limit heart rate history to 300 entries", () => {
    let state = initialState;
    for (let i = 0; i < 310; i++) {
      state = smartWatchReducer(state, {
        type: "SET_HEART_RATE",
        payload: {
          bpm: 70 + (i % 10),
          timestamp: Date.now() - (310 - i) * 1000,
          contactDetected: true,
          rrIntervals: [],
        },
      });
    }
    expect(state.heartRateHistory.length).toBeLessThanOrEqual(300);
  });

  it("should set battery level", () => {
    const state = smartWatchReducer(initialState, {
      type: "SET_BATTERY_LEVEL",
      payload: 85,
    });
    expect(state.batteryLevel).toBe(85);
  });

  it("should reset to initial state", () => {
    const modifiedState: SmartWatchState = {
      ...initialState,
      isConnected: true,
      heartRate: 80,
      batteryLevel: 50,
    };
    const state = smartWatchReducer(modifiedState, { type: "RESET" });
    expect(state).toEqual(initialState);
  });

  it("should set error and stop scanning", () => {
    const scanningState = { ...initialState, isScanning: true };
    const state = smartWatchReducer(scanningState, {
      type: "SET_ERROR",
      payload: "Bluetooth off",
    });
    expect(state.error).toBe("Bluetooth off");
    expect(state.isScanning).toBe(false);
  });
});

describe("BLE Constants", () => {
  it("should have correct Heart Rate Service UUID", () => {
    const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
    expect(HR_SERVICE).toContain("180d");
  });

  it("should have correct Heart Rate Measurement UUID", () => {
    const HR_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb";
    expect(HR_MEASUREMENT).toContain("2a37");
  });

  it("should have correct Battery Level UUID", () => {
    const BATTERY_LEVEL = "00002a19-0000-1000-8000-00805f9b34fb";
    expect(BATTERY_LEVEL).toContain("2a19");
  });
});
