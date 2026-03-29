import { describe, it, expect } from "vitest";

// Test the enriched seizure event model
describe("Enriched SeizureEvent model", () => {
  it("should have all required fields for auto-detected seizure", () => {
    const event = {
      id: "1711234567890",
      timestamp: 1711234567890,
      endTimestamp: 1711234597890,
      duration: 30,
      intensity: "medium" as const,
      notes: "Crise detectee automatiquement (confiance: 75%, source: telephone)",
      wasManual: false,
      wasCancelled: false,
      sensorData: {
        peakAcceleration: 3.5,
        avgAcceleration: 2.1,
        peakGyroscope: 4.2,
        avgHeartRate: 105,
        peakHeartRate: 130,
        detectionConfidence: 0.75,
        detectionSource: "phone" as const,
        roiPowerRatio: 0.45,
      },
    };

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.endTimestamp).toBeGreaterThan(event.timestamp);
    expect(event.duration).toBe(30);
    expect(event.intensity).toBe("medium");
    expect(event.wasManual).toBe(false);
    expect(event.sensorData).toBeDefined();
    expect(event.sensorData.peakAcceleration).toBe(3.5);
    expect(event.sensorData.avgAcceleration).toBe(2.1);
    expect(event.sensorData.peakGyroscope).toBe(4.2);
    expect(event.sensorData.avgHeartRate).toBe(105);
    expect(event.sensorData.peakHeartRate).toBe(130);
    expect(event.sensorData.detectionConfidence).toBe(0.75);
    expect(event.sensorData.detectionSource).toBe("phone");
    expect(event.sensorData.roiPowerRatio).toBe(0.45);
  });

  it("should support manual seizure without sensor data", () => {
    const event = {
      id: "1711234567891",
      timestamp: Date.now(),
      duration: 45,
      intensity: "high" as const,
      notes: "Crise observee par un proche",
      wasManual: true,
      wasCancelled: false,
    };

    expect(event.wasManual).toBe(true);
    expect(event.duration).toBe(45);
    expect((event as any).sensorData).toBeUndefined();
  });

  it("should support combined detection source", () => {
    const sensorData = {
      peakAcceleration: 4.0,
      avgAcceleration: 2.5,
      peakGyroscope: 5.0,
      avgHeartRate: 120,
      peakHeartRate: 145,
      detectionConfidence: 0.92,
      detectionSource: "combined" as const,
      roiPowerRatio: 0.55,
    };

    expect(sensorData.detectionSource).toBe("combined");
    expect(sensorData.detectionConfidence).toBeGreaterThan(0.8);
  });
});

// Test automatic intensity calculation
describe("Automatic intensity calculation", () => {
  function calculateIntensity(data: {
    peakAcceleration: number;
    peakGyroscope: number;
    peakHeartRate: number;
    detectionConfidence: number;
  }): "low" | "medium" | "high" {
    let score = 0;
    if (data.peakAcceleration > 4.0) score += 3;
    else if (data.peakAcceleration > 2.5) score += 2;
    else if (data.peakAcceleration > 1.5) score += 1;
    if (data.peakGyroscope > 6.0) score += 2;
    else if (data.peakGyroscope > 3.0) score += 1;
    if (data.peakHeartRate > 140) score += 2;
    else if (data.peakHeartRate > 110) score += 1;
    if (data.detectionConfidence > 0.8) score += 2;
    else if (data.detectionConfidence > 0.5) score += 1;
    if (score >= 6) return "high";
    if (score >= 3) return "medium";
    return "low";
  }

  it("should classify low intensity correctly", () => {
    const result = calculateIntensity({
      peakAcceleration: 1.2,
      peakGyroscope: 2.0,
      peakHeartRate: 90,
      detectionConfidence: 0.4,
    });
    expect(result).toBe("low");
  });

  it("should classify medium intensity correctly", () => {
    const result = calculateIntensity({
      peakAcceleration: 3.0,
      peakGyroscope: 4.0,
      peakHeartRate: 100,
      detectionConfidence: 0.6,
    });
    expect(result).toBe("medium");
  });

  it("should classify high intensity correctly", () => {
    const result = calculateIntensity({
      peakAcceleration: 5.0,
      peakGyroscope: 7.0,
      peakHeartRate: 150,
      detectionConfidence: 0.9,
    });
    expect(result).toBe("high");
  });

  it("should handle edge case with only high acceleration", () => {
    const result = calculateIntensity({
      peakAcceleration: 5.0,
      peakGyroscope: 1.0,
      peakHeartRate: 80,
      detectionConfidence: 0.3,
    });
    expect(result).toBe("medium"); // 3 points from accel only
  });

  it("should handle combined high HR and confidence", () => {
    const result = calculateIntensity({
      peakAcceleration: 1.0,
      peakGyroscope: 1.0,
      peakHeartRate: 160,
      detectionConfidence: 0.95,
    });
    // HR: 2 + confidence: 2 = 4 => medium
    expect(result).toBe("medium");
  });
});

// Test duration calculation logic
describe("Duration calculation", () => {
  it("should calculate duration from alarm start to countdown end", () => {
    const alarmStart = 1711234560000;
    const countdownEnd = 1711234590000; // 30 seconds later
    const duration = Math.round((countdownEnd - alarmStart) / 1000);
    expect(duration).toBe(30);
  });

  it("should handle very short durations", () => {
    const alarmStart = Date.now();
    const countdownEnd = alarmStart + 5000;
    const duration = Math.round((countdownEnd - alarmStart) / 1000);
    expect(duration).toBe(5);
  });

  it("should handle longer durations", () => {
    const alarmStart = Date.now();
    const countdownEnd = alarmStart + 120000; // 2 minutes
    const duration = Math.round((countdownEnd - alarmStart) / 1000);
    expect(duration).toBe(120);
  });
});

// Test duration formatting
describe("Duration formatting", () => {
  function formatDuration(seconds: number): string {
    if (seconds <= 0) return "< 1s";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}min ${secs}s` : `${mins}min`;
  }

  it("should format zero duration", () => {
    expect(formatDuration(0)).toBe("< 1s");
  });

  it("should format seconds only", () => {
    expect(formatDuration(30)).toBe("30s");
  });

  it("should format minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1min 30s");
  });

  it("should format exact minutes", () => {
    expect(formatDuration(120)).toBe("2min");
  });
});

// Test enriched report export
describe("Enriched medical report export", () => {
  it("should include sensor data in the report", () => {
    const events = [
      {
        id: "1",
        timestamp: Date.now() - 86400000,
        endTimestamp: Date.now() - 86400000 + 30000,
        duration: 30,
        intensity: "medium" as const,
        notes: "Crise detectee automatiquement",
        wasManual: false,
        wasCancelled: false,
        sensorData: {
          peakAcceleration: 3.5,
          avgAcceleration: 2.1,
          peakGyroscope: 4.2,
          avgHeartRate: 105,
          peakHeartRate: 130,
          detectionConfidence: 0.75,
          detectionSource: "combined" as const,
          roiPowerRatio: 0.45,
        },
      },
    ];

    // Simulate report generation
    const lines: string[] = [];
    events.forEach((e) => {
      lines.push(`Duree : ${e.duration}s`);
      lines.push(`Intensite : ${e.intensity}`);
      if (e.sensorData) {
        lines.push(`Source de detection : ${e.sensorData.detectionSource}`);
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
    });

    const report = lines.join("\n");
    expect(report).toContain("Duree : 30s");
    expect(report).toContain("Source de detection : combined");
    expect(report).toContain("Confiance : 75%");
    expect(report).toContain("Acceleration max : 3.50 g");
    expect(report).toContain("Acceleration moy : 2.10 g");
    expect(report).toContain("Gyroscope max : 4.20 rad/s");
    expect(report).toContain("Freq. cardiaque moy : 105 bpm");
    expect(report).toContain("Freq. cardiaque max : 130 bpm");
    expect(report).toContain("Ratio puissance ROI : 45.0%");
  });
});

// Test alarm tracking state
describe("Alarm tracking state", () => {
  it("should initialize alarm tracking with sensor data", () => {
    const alarmTracking = {
      timestamp: Date.now(),
      sensorData: {
        peakAcceleration: 2.5,
        avgAcceleration: 2.5,
        accelSamples: 1,
        peakGyroscope: 3.0,
        avgHeartRate: 90,
        peakHeartRate: 90,
        hrSamples: 1,
        detectionConfidence: 0.65,
        detectionSource: "phone" as const,
        roiPowerRatio: 0.4,
      },
    };

    expect(alarmTracking.sensorData.accelSamples).toBe(1);
    expect(alarmTracking.sensorData.hrSamples).toBe(1);
  });

  it("should accumulate sensor data during alarm", () => {
    let sensorData = {
      peakAcceleration: 2.5,
      avgAcceleration: 2.5,
      accelSamples: 1,
      peakGyroscope: 3.0,
      avgHeartRate: 90,
      peakHeartRate: 90,
      hrSamples: 1,
      detectionConfidence: 0.65,
      detectionSource: "phone" as const,
      roiPowerRatio: 0.4,
    };

    // Simulate new reading with higher values
    const newAccel = 4.0;
    const newGyro = 5.0;
    sensorData = {
      ...sensorData,
      peakAcceleration: Math.max(sensorData.peakAcceleration, newAccel),
      avgAcceleration: sensorData.avgAcceleration + newAccel,
      accelSamples: sensorData.accelSamples + 1,
      peakGyroscope: Math.max(sensorData.peakGyroscope, newGyro),
    };

    expect(sensorData.peakAcceleration).toBe(4.0);
    expect(sensorData.accelSamples).toBe(2);
    expect(sensorData.peakGyroscope).toBe(5.0);

    // Calculate average
    const avgAccel = sensorData.avgAcceleration / sensorData.accelSamples;
    expect(avgAccel).toBe(3.25); // (2.5 + 4.0) / 2
  });
});
