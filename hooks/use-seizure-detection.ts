import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { Accelerometer, Gyroscope } from "expo-sensors";
import { useAppState, type MonitoringStatus } from "@/lib/app-context";
import {
  setupNotifications,
  sendSeizureAlertNotification,
  sendCountdownNotification,
  sendFalseAlarmNotification,
  sendMonitoringActiveNotification,
  dismissMonitoringNotification,
  sendBackgroundStatusNotification,
} from "@/lib/notification-service";
import {
  registerBackgroundDetection,
  unregisterBackgroundDetection,
  wasMonitoringActive,
} from "@/lib/background-detection";
import {
  analyzeHeartRateForSeizure,
  type HeartRateData,
} from "@/lib/smartwatch-service";

// Detection parameters based on OpenSeizureDetector algorithm
const SAMPLE_RATE_MS = 40; // 25 Hz
const BUFFER_SIZE = 125; // 5 seconds at 25 Hz
const ROI_LOW = 3; // Hz - lower bound of region of interest
const ROI_HIGH = 8; // Hz - upper bound of region of interest
const FREQ_RESOLUTION = 0.2; // Hz per bin (25Hz / 125 samples)

// Sensitivity thresholds
const THRESHOLDS = {
  low: { magnitudeThreshold: 2.5, roiRatioThreshold: 0.6, consecutiveWarnings: 3 },
  medium: { magnitudeThreshold: 2.0, roiRatioThreshold: 0.5, consecutiveWarnings: 2 },
  high: { magnitudeThreshold: 1.5, roiRatioThreshold: 0.4, consecutiveWarnings: 2 },
};

interface AccelData {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

/**
 * Simplified FFT-based seizure detection.
 * Computes magnitude of acceleration, then analyzes frequency content
 * in the 3-8 Hz region of interest (typical tonic-clonic seizure range).
 */
function computeROIPower(magnitudes: number[]): { roiPower: number; totalPower: number; ratio: number } {
  const n = magnitudes.length;
  if (n < BUFFER_SIZE) return { roiPower: 0, totalPower: 0, ratio: 0 };

  // Remove DC component (gravity)
  const mean = magnitudes.reduce((a, b) => a + b, 0) / n;
  const centered = magnitudes.map((v) => v - mean);

  // Compute power spectrum using DFT for ROI bins only
  const roiLowBin = Math.floor(ROI_LOW / FREQ_RESOLUTION);
  const roiHighBin = Math.ceil(ROI_HIGH / FREQ_RESOLUTION);
  const maxBin = Math.floor(n / 2);

  let roiPower = 0;
  let totalPower = 0;

  for (let k = 1; k <= maxBin; k++) {
    let real = 0;
    let imag = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      real += centered[t] * Math.cos(angle);
      imag -= centered[t] * Math.sin(angle);
    }
    const power = (real * real + imag * imag) / (n * n);
    totalPower += power;
    if (k >= roiLowBin && k <= roiHighBin) {
      roiPower += power;
    }
  }

  const ratio = totalPower > 0 ? roiPower / totalPower : 0;
  return { roiPower, totalPower, ratio };
}

/**
 * Combined detection score from phone sensors + smartwatch data
 * Phone sensors: movement analysis (0-1 score)
 * Smartwatch: heart rate analysis (0-1 score)
 * Combined: weighted average with bonus for multi-source confirmation
 */
export function computeCombinedScore(
  phoneScore: number,
  watchScore: number,
  hasWatch: boolean
): { combinedScore: number; confidence: "low" | "medium" | "high" } {
  if (!hasWatch) {
    // Phone-only mode
    return {
      combinedScore: phoneScore,
      confidence: phoneScore > 0.7 ? "medium" : "low",
    };
  }

  // Multi-source mode: weighted combination
  const PHONE_WEIGHT = 0.55;
  const WATCH_WEIGHT = 0.45;

  let combinedScore = phoneScore * PHONE_WEIGHT + watchScore * WATCH_WEIGHT;

  // Multi-source confirmation bonus: if both detect anomaly, boost confidence
  if (phoneScore > 0.3 && watchScore > 0.3) {
    combinedScore = Math.min(combinedScore * 1.3, 1.0);
  }

  // Determine confidence level
  let confidence: "low" | "medium" | "high" = "low";
  if (combinedScore > 0.7 && phoneScore > 0.3 && watchScore > 0.3) {
    confidence = "high";
  } else if (combinedScore > 0.5) {
    confidence = "medium";
  }

  return { combinedScore, confidence };
}

// Exported type for current sensor readings
export interface CurrentSensorReadings {
  currentAccelMagnitude: number;
  currentGyroMagnitude: number;
  currentHeartRate: number;
  currentRoiRatio: number;
  currentPhoneScore: number;
  currentWatchScore: number;
  currentCombinedScore: number;
  currentConfidence: "low" | "medium" | "high";
  hasWatch: boolean;
}

export function useSeizureDetection(heartRateHistory?: HeartRateData[]) {
  const { state, dispatch } = useAppState();
  const accelBuffer = useRef<number[]>([]);
  const consecutiveDetections = useRef(0);
  const statusRef = useRef<MonitoringStatus>("active");
  const accelSubRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentGyro = useRef({ x: 0, y: 0, z: 0 });
  const monitoringNotifId = useRef<string>("");
  const notificationsReady = useRef(false);
  const heartRateHistoryRef = useRef<HeartRateData[]>([]);
  // Real-time sensor readings for UI and seizure recording
  const sensorReadingsRef = useRef<CurrentSensorReadings>({
    currentAccelMagnitude: 0,
    currentGyroMagnitude: 0,
    currentHeartRate: 0,
    currentRoiRatio: 0,
    currentPhoneScore: 0,
    currentWatchScore: 0,
    currentCombinedScore: 0,
    currentConfidence: "low",
    hasWatch: false,
  });
  // Peak tracking during alarm for seizure recording
  const peakAccelRef = useRef(0);
  const accelSumRef = useRef(0);
  const accelCountRef = useRef(0);
  const peakGyroRef = useRef(0);

  // Keep heart rate history ref in sync
  useEffect(() => {
    if (heartRateHistory) {
      heartRateHistoryRef.current = heartRateHistory;
    }
  }, [heartRateHistory]);

  const sensitivity = state.detectionSettings.sensitivity;
  const thresholds = THRESHOLDS[sensitivity];

  // Initialize notifications on mount
  useEffect(() => {
    if (Platform.OS !== "web") {
      setupNotifications().then((granted) => {
        notificationsReady.current = granted;
      });
    }
  }, []);

  // Auto-resume monitoring if it was active before app restart
  useEffect(() => {
    if (Platform.OS === "web") return;
    wasMonitoringActive().then((wasActive) => {
      if (wasActive && !state.isMonitoring) {
        startDetection();
      }
    });
  }, []);

  const startDetection = useCallback(async () => {
    // Request notification permissions first
    if (Platform.OS !== "web" && !notificationsReady.current) {
      const granted = await setupNotifications();
      notificationsReady.current = granted;
    }

    if (Platform.OS === "web") {
      // On web, sensors may not be available - use simulated mode
      dispatch({ type: "SET_MONITORING", payload: true });
      return;
    }

    const accelAvailable = await Accelerometer.isAvailableAsync();
    if (!accelAvailable) {
      console.warn("Accelerometer not available");
      dispatch({ type: "SET_MONITORING", payload: true });
      return;
    }

    // Set update intervals
    Accelerometer.setUpdateInterval(SAMPLE_RATE_MS);

    const gyroAvailable = await Gyroscope.isAvailableAsync();
    if (gyroAvailable) {
      Gyroscope.setUpdateInterval(SAMPLE_RATE_MS);
      gyroSubRef.current = Gyroscope.addListener((data) => {
        currentGyro.current = data;
      });
    }

    // Collect accelerometer data
    accelSubRef.current = Accelerometer.addListener((data: AccelData) => {
      const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      accelBuffer.current.push(magnitude);

      // Keep buffer at max size
      if (accelBuffer.current.length > BUFFER_SIZE * 2) {
        accelBuffer.current = accelBuffer.current.slice(-BUFFER_SIZE);
      }
    });

    // Analyze buffer every 5 seconds
    analysisIntervalRef.current = setInterval(() => {
      if (accelBuffer.current.length < BUFFER_SIZE) return;

      const samples = accelBuffer.current.slice(-BUFFER_SIZE);
      const { roiPower, ratio } = computeROIPower(samples);

      // Also check gyroscope for rotational movement
      const gyroMag = Math.sqrt(
        currentGyro.current.x ** 2 +
        currentGyro.current.y ** 2 +
        currentGyro.current.z ** 2
      );

      const isSeizureLike =
        roiPower > thresholds.magnitudeThreshold * 0.01 &&
        ratio > thresholds.roiRatioThreshold;

      // Additional check: high gyroscope activity suggests seizure
      const highGyroActivity = gyroMag > 3.0;

      // Phone sensor score (0-1)
      let phoneScore = 0;
      if (isSeizureLike) phoneScore += 0.5;
      if (highGyroActivity) phoneScore += 0.3;
      if (ratio > thresholds.roiRatioThreshold * 1.5) phoneScore += 0.2;
      phoneScore = Math.min(phoneScore, 1.0);

      // Smartwatch heart rate score (0-1)
      const hasWatch = heartRateHistoryRef.current.length >= 5;
      const hrAnalysis = hasWatch
        ? analyzeHeartRateForSeizure(heartRateHistoryRef.current)
        : null;
      const watchScore = hrAnalysis ? hrAnalysis.confidenceScore : 0;

      // Combined multi-source score
      const { combinedScore, confidence } = computeCombinedScore(
        phoneScore,
        watchScore,
        hasWatch
      );

      // Current acceleration magnitude (latest sample)
      const currentAccelMag = samples.length > 0 ? samples[samples.length - 1] : 0;
      const currentHR = heartRateHistoryRef.current.length > 0
        ? heartRateHistoryRef.current[0].bpm
        : 0;

      // Update real-time sensor readings
      sensorReadingsRef.current = {
        currentAccelMagnitude: currentAccelMag,
        currentGyroMagnitude: gyroMag,
        currentHeartRate: currentHR,
        currentRoiRatio: ratio,
        currentPhoneScore: phoneScore,
        currentWatchScore: watchScore,
        currentCombinedScore: combinedScore,
        currentConfidence: confidence,
        hasWatch,
      };

      // Track peak values during alarm for seizure recording
      if (statusRef.current === "alarm" || statusRef.current === "warning") {
        if (currentAccelMag > peakAccelRef.current) peakAccelRef.current = currentAccelMag;
        accelSumRef.current += currentAccelMag;
        accelCountRef.current += 1;
        if (gyroMag > peakGyroRef.current) peakGyroRef.current = gyroMag;
      }

      // Use combined score for detection decision
      const effectiveDetection = hasWatch
        ? combinedScore > 0.5
        : isSeizureLike || highGyroActivity;

      if (effectiveDetection) {
        consecutiveDetections.current += 1;
      } else {
        consecutiveDetections.current = Math.max(0, consecutiveDetections.current - 1);
      }

      // Update status based on consecutive detections
      // With smartwatch, require fewer consecutive detections if confidence is high
      const requiredConsecutive = hasWatch && confidence === "high"
        ? Math.max(1, thresholds.consecutiveWarnings - 1)
        : thresholds.consecutiveWarnings;

      if (consecutiveDetections.current >= requiredConsecutive + 1) {
        if (statusRef.current !== "alarm") {
          statusRef.current = "alarm";
          dispatch({ type: "SET_STATUS", payload: "alarm" });
          // Start alarm tracking with initial sensor data
          const detectionSource = hasWatch && phoneScore > 0.3 && watchScore > 0.3
            ? "combined" as const
            : hasWatch && watchScore > phoneScore
            ? "watch" as const
            : "phone" as const;
          dispatch({
            type: "START_ALARM_TRACKING",
            payload: {
              timestamp: Date.now(),
              sensorData: {
                peakAcceleration: currentAccelMag,
                avgAcceleration: currentAccelMag,
                accelSamples: 1,
                peakGyroscope: gyroMag,
                avgHeartRate: currentHR,
                peakHeartRate: currentHR,
                hrSamples: currentHR > 0 ? 1 : 0,
                detectionConfidence: combinedScore,
                detectionSource,
                roiPowerRatio: ratio,
              },
            },
          });
          // Reset peak trackers
          peakAccelRef.current = currentAccelMag;
          accelSumRef.current = currentAccelMag;
          accelCountRef.current = 1;
          peakGyroRef.current = gyroMag;
          // Send seizure alert notification
          sendSeizureAlertNotification();
          sendCountdownNotification(30);
        }
      } else if (consecutiveDetections.current >= 1) {
        if (statusRef.current !== "warning" && statusRef.current !== "alarm") {
          statusRef.current = "warning";
          dispatch({ type: "SET_STATUS", payload: "warning" });
        }
      } else {
        if (statusRef.current !== "active") {
          statusRef.current = "active";
          dispatch({ type: "SET_STATUS", payload: "active" });
        }
      }
    }, 5000);

    dispatch({ type: "SET_MONITORING", payload: true });
    statusRef.current = "active";

    // Register background task and show persistent notification
    await registerBackgroundDetection();
    monitoringNotifId.current = await sendMonitoringActiveNotification();
  }, [dispatch, thresholds]);

  const stopDetection = useCallback(async () => {
    accelSubRef.current?.remove();
    gyroSubRef.current?.remove();
    accelSubRef.current = null;
    gyroSubRef.current = null;

    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }

    accelBuffer.current = [];
    consecutiveDetections.current = 0;
    statusRef.current = "inactive";
    dispatch({ type: "SET_MONITORING", payload: false });

    // Unregister background task and dismiss notification
    await unregisterBackgroundDetection();
    if (monitoringNotifId.current) {
      await dismissMonitoringNotification(monitoringNotifId.current);
      monitoringNotifId.current = "";
    }
  }, [dispatch]);

  const resetToActive = useCallback(() => {
    consecutiveDetections.current = 0;
    statusRef.current = "active";
    dispatch({ type: "SET_STATUS", payload: "active" });
  }, [dispatch]);

  const cancelAlarmWithNotification = useCallback(async () => {
    resetToActive();
    // Send notification on native platforms
    sendFalseAlarmNotification();
  }, [resetToActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      accelSubRef.current?.remove();
      gyroSubRef.current?.remove();
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
    };
  }, []);

  // Getter for current sensor readings (for UI display)
  const getSensorReadings = useCallback(() => {
    return sensorReadingsRef.current;
  }, []);

  return {
    startDetection,
    stopDetection,
    resetToActive,
    cancelAlarmWithNotification,
    getSensorReadings,
    isMonitoring: state.isMonitoring,
    status: state.monitoringStatus,
  };
}
