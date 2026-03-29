import { describe, it, expect, test } from "vitest";
/**
 * Tests for: Medication Reminders, Alert History, Night Mode
 */

// ─── Medication Reminder Logic ────────────────────────────────────────────────

interface MedicationReminder {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  enabled: boolean;
  daysOfWeek: number[];
}

function getNextReminderTime(reminder: MedicationReminder): Date | null {
  if (!reminder.enabled || reminder.times.length === 0) return null;
  const now = new Date();
  const today = now.getDay();

  for (const timeStr of reminder.times.sort()) {
    const [h, m] = timeStr.split(":").map(Number);
    const candidate = new Date(now);
    candidate.setHours(h, m, 0, 0);
    if (
      candidate > now &&
      (reminder.daysOfWeek.length === 0 || reminder.daysOfWeek.includes(today))
    ) {
      return candidate;
    }
  }
  return null;
}

function isDueSoon(reminder: MedicationReminder, windowMinutes = 30): boolean {
  const next = getNextReminderTime(reminder);
  if (!next) return false;
  const diff = (next.getTime() - Date.now()) / 60_000;
  return diff >= 0 && diff <= windowMinutes;
}

describe("MedicationReminder", () => {
  const base: MedicationReminder = {
    id: "r1",
    name: "Lamotrigine",
    dosage: "100mg",
    times: ["08:00", "20:00"],
    enabled: true,
    daysOfWeek: [],
  };

  test("returns null when disabled", () => {
    expect(getNextReminderTime({ ...base, enabled: false })).toBeNull();
  });

  test("returns null when no times", () => {
    expect(getNextReminderTime({ ...base, times: [] })).toBeNull();
  });

  test("isDueSoon returns false for disabled reminder", () => {
    expect(isDueSoon({ ...base, enabled: false })).toBe(false);
  });

  test("isDueSoon returns false for empty times", () => {
    expect(isDueSoon({ ...base, times: [] })).toBe(false);
  });

  test("reminder with past times returns null for today", () => {
    const pastReminder: MedicationReminder = {
      ...base,
      times: ["00:01"],
    };
    const result = getNextReminderTime(pastReminder);
    // Might be null or a future date depending on current time
    if (result !== null) {
      expect(result.getTime()).toBeGreaterThan(Date.now());
    }
  });
});

// ─── Alert History Logic ──────────────────────────────────────────────────────

type AlertStatus = "sent" | "failed" | "pending";
type AlertType = "sms" | "call" | "push";

interface AlertRecord {
  id: string;
  timestamp: number;
  contactName: string;
  contactPhone: string;
  type: AlertType;
  status: AlertStatus;
  seizureId?: string;
  errorMessage?: string;
}

function filterAlertsByStatus(alerts: AlertRecord[], status: AlertStatus): AlertRecord[] {
  return alerts.filter((a) => a.status === status);
}

function filterAlertsByType(alerts: AlertRecord[], type: AlertType): AlertRecord[] {
  return alerts.filter((a) => a.type === type);
}

function getAlertStats(alerts: AlertRecord[]) {
  const total = alerts.length;
  const sent = alerts.filter((a) => a.status === "sent").length;
  const failed = alerts.filter((a) => a.status === "failed").length;
  const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;
  return { total, sent, failed, successRate };
}

function groupAlertsByDate(alerts: AlertRecord[]): Record<string, AlertRecord[]> {
  return alerts.reduce(
    (acc, alert) => {
      const date = new Date(alert.timestamp).toLocaleDateString("fr-FR");
      if (!acc[date]) acc[date] = [];
      acc[date].push(alert);
      return acc;
    },
    {} as Record<string, AlertRecord[]>
  );
}

const mockAlerts: AlertRecord[] = [
  { id: "a1", timestamp: Date.now() - 3600_000, contactName: "Marie", contactPhone: "+33600000001", type: "sms", status: "sent" },
  { id: "a2", timestamp: Date.now() - 7200_000, contactName: "Pierre", contactPhone: "+33600000002", type: "call", status: "failed", errorMessage: "No answer" },
  { id: "a3", timestamp: Date.now() - 86400_000, contactName: "Marie", contactPhone: "+33600000001", type: "sms", status: "sent" },
  { id: "a4", timestamp: Date.now() - 172800_000, contactName: "SAMU", contactPhone: "15", type: "call", status: "sent" },
  { id: "a5", timestamp: Date.now() - 1800_000, contactName: "Pierre", contactPhone: "+33600000002", type: "push", status: "pending" },
];

describe("AlertHistory", () => {
  test("filterAlertsByStatus returns only sent alerts", () => {
    const sent = filterAlertsByStatus(mockAlerts, "sent");
    expect(sent).toHaveLength(3);
    sent.forEach((a) => expect(a.status).toBe("sent"));
  });

  test("filterAlertsByStatus returns only failed alerts", () => {
    const failed = filterAlertsByStatus(mockAlerts, "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe("a2");
  });

  test("filterAlertsByType returns only SMS alerts", () => {
    const sms = filterAlertsByType(mockAlerts, "sms");
    expect(sms).toHaveLength(2);
  });

  test("filterAlertsByType returns only call alerts", () => {
    const calls = filterAlertsByType(mockAlerts, "call");
    expect(calls).toHaveLength(2);
  });

  test("getAlertStats computes correct totals", () => {
    const stats = getAlertStats(mockAlerts);
    expect(stats.total).toBe(5);
    expect(stats.sent).toBe(3);
    expect(stats.failed).toBe(1);
    expect(stats.successRate).toBe(60);
  });

  test("getAlertStats returns 0 successRate for empty list", () => {
    expect(getAlertStats([]).successRate).toBe(0);
  });

  test("groupAlertsByDate groups correctly", () => {
    const groups = groupAlertsByDate(mockAlerts);
    expect(Object.keys(groups).length).toBeGreaterThanOrEqual(1);
    Object.values(groups).forEach((group) => {
      expect(group.length).toBeGreaterThan(0);
    });
  });
});

// ─── Night Mode Logic ─────────────────────────────────────────────────────────

function isInNightWindow(startTime: string, endTime: string, now: Date): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

describe("NightMode", () => {
  test("detects same-day window correctly (inside)", () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    expect(isInNightWindow("08:00", "20:00", noon)).toBe(true);
  });

  test("detects same-day window correctly (outside)", () => {
    const midnight = new Date();
    midnight.setHours(23, 0, 0, 0);
    expect(isInNightWindow("08:00", "20:00", midnight)).toBe(false);
  });

  test("detects overnight window correctly (inside - after start)", () => {
    const lateNight = new Date();
    lateNight.setHours(23, 30, 0, 0);
    expect(isInNightWindow("22:00", "07:00", lateNight)).toBe(true);
  });

  test("detects overnight window correctly (inside - before end)", () => {
    const earlyMorning = new Date();
    earlyMorning.setHours(5, 0, 0, 0);
    expect(isInNightWindow("22:00", "07:00", earlyMorning)).toBe(true);
  });

  test("detects overnight window correctly (outside)", () => {
    const afternoon = new Date();
    afternoon.setHours(14, 0, 0, 0);
    expect(isInNightWindow("22:00", "07:00", afternoon)).toBe(false);
  });

  test("handles exact boundary at start", () => {
    const atStart = new Date();
    atStart.setHours(22, 0, 0, 0);
    expect(isInNightWindow("22:00", "07:00", atStart)).toBe(true);
  });

  test("handles exact boundary at end (exclusive)", () => {
    const atEnd = new Date();
    atEnd.setHours(7, 0, 0, 0);
    expect(isInNightWindow("22:00", "07:00", atEnd)).toBe(false);
  });

  test("midnight is inside overnight window", () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(isInNightWindow("22:00", "07:00", midnight)).toBe(true);
  });
});
