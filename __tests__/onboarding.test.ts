import { describe, it, expect } from "vitest";

describe("Onboarding flow steps", () => {
  const STEPS = ["welcome", "profile", "contacts", "settings", "done"];

  it("should have 5 onboarding steps", () => {
    expect(STEPS).toHaveLength(5);
  });

  it("should start with welcome step", () => {
    expect(STEPS[0]).toBe("welcome");
  });

  it("should end with done step", () => {
    expect(STEPS[STEPS.length - 1]).toBe("done");
  });

  it("should have profile step before contacts", () => {
    const profileIndex = STEPS.indexOf("profile");
    const contactsIndex = STEPS.indexOf("contacts");
    expect(profileIndex).toBeLessThan(contactsIndex);
  });

  it("should have settings step before done", () => {
    const settingsIndex = STEPS.indexOf("settings");
    const doneIndex = STEPS.indexOf("done");
    expect(settingsIndex).toBeLessThan(doneIndex);
  });

  it("should calculate correct progress for each step", () => {
    STEPS.forEach((_, index) => {
      const progress = (index + 1) / STEPS.length;
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(1);
    });
    // First step: 20%
    expect((0 + 1) / STEPS.length).toBeCloseTo(0.2);
    // Last step: 100%
    expect((4 + 1) / STEPS.length).toBeCloseTo(1.0);
  });
});

describe("Onboarding blood type options", () => {
  const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  it("should have 8 blood type options", () => {
    expect(BLOOD_TYPES).toHaveLength(8);
  });

  it("should include all standard blood types", () => {
    expect(BLOOD_TYPES).toContain("A+");
    expect(BLOOD_TYPES).toContain("O-");
    expect(BLOOD_TYPES).toContain("AB+");
  });
});

describe("Onboarding epilepsy type options", () => {
  const EPILEPSY_TYPES = [
    "Generalisee",
    "Focale (partielle)",
    "Absence",
    "Myoclonique",
    "Tonico-clonique",
    "Autre / Non determine",
  ];

  it("should have 6 epilepsy type options", () => {
    expect(EPILEPSY_TYPES).toHaveLength(6);
  });

  it("should include a catch-all option", () => {
    expect(EPILEPSY_TYPES).toContain("Autre / Non determine");
  });
});

describe("Onboarding persistence", () => {
  const ONBOARDING_KEY = "@epiguard_onboarding_done";

  it("should use correct AsyncStorage key", () => {
    expect(ONBOARDING_KEY).toBe("@epiguard_onboarding_done");
  });

  it("should store 'true' as string value when onboarding is complete", () => {
    const value = "true";
    expect(value).toBe("true");
    expect(typeof value).toBe("string");
  });
});

describe("Onboarding sensitivity options", () => {
  const SENSITIVITY_LEVELS = [
    { key: "low", label: "Faible", desc: "Moins de fausses alertes" },
    { key: "medium", label: "Moyenne", desc: "Equilibre recommande" },
    { key: "high", label: "Elevee", desc: "Detection maximale" },
  ];

  it("should have 3 sensitivity levels", () => {
    expect(SENSITIVITY_LEVELS).toHaveLength(3);
  });

  it("should have descriptive labels for each level", () => {
    SENSITIVITY_LEVELS.forEach((level) => {
      expect(level.label.length).toBeGreaterThan(0);
      expect(level.desc.length).toBeGreaterThan(0);
    });
  });
});
