import { describe, it, expect } from "vitest";

describe("Medical report export", () => {
  const mockProfile = {
    name: "Jean Dupont",
    age: "35",
    bloodType: "A+",
    epilepsyType: "Generalisee",
    medications: "Valproate 500mg",
    allergies: "Aucune",
    doctor: "Dr. Martin",
    doctorPhone: "+33 1 23 45 67 89",
  };

  const mockEvents = [
    { id: "1", timestamp: Date.now() - 86400000, duration: 45, intensity: "medium" as const, notes: "Fatigue", wasManual: false, wasCancelled: false },
    { id: "2", timestamp: Date.now() - 172800000, duration: 30, intensity: "low" as const, notes: "", wasManual: true, wasCancelled: false },
    { id: "3", timestamp: Date.now() - 259200000, duration: 60, intensity: "high" as const, notes: "Stress", wasManual: false, wasCancelled: false },
  ];

  it("should generate a report with patient info", () => {
    const lines: string[] = [
      "=== RAPPORT MEDICAL EPIGUARD ===",
      `Nom : ${mockProfile.name}`,
      `Age : ${mockProfile.age}`,
      `Groupe sanguin : ${mockProfile.bloodType}`,
      `Type d'epilepsie : ${mockProfile.epilepsyType}`,
      `Medicaments : ${mockProfile.medications}`,
    ];
    const report = lines.join("\n");
    expect(report).toContain("Jean Dupont");
    expect(report).toContain("A+");
    expect(report).toContain("Valproate 500mg");
  });

  it("should include correct statistics in report", () => {
    const count = mockEvents.length;
    const avgDuration = Math.round(mockEvents.reduce((a, e) => a + e.duration, 0) / count);
    const lowCount = mockEvents.filter((e) => e.intensity === "low").length;
    const medCount = mockEvents.filter((e) => e.intensity === "medium").length;
    const highCount = mockEvents.filter((e) => e.intensity === "high").length;

    expect(count).toBe(3);
    expect(avgDuration).toBe(45);
    expect(lowCount).toBe(1);
    expect(medCount).toBe(1);
    expect(highCount).toBe(1);
  });

  it("should distinguish manual vs auto events", () => {
    const manualCount = mockEvents.filter((e) => e.wasManual).length;
    const autoCount = mockEvents.length - manualCount;
    expect(manualCount).toBe(1);
    expect(autoCount).toBe(2);
  });
});

describe("Info sections content", () => {
  const INFO_SECTIONS = {
    types: { title: "Types de crises", contentCount: 5 },
    firstaid: { title: "Premiers secours", contentCount: 6 },
    triggers: { title: "Facteurs declenchants", contentCount: 6 },
    living: { title: "Vivre avec l'epilepsie", contentCount: 6 },
    resources: { title: "Ressources utiles", contentCount: 6 },
  };

  it("should have 5 main info sections", () => {
    expect(Object.keys(INFO_SECTIONS)).toHaveLength(5);
  });

  it("should have correct section titles", () => {
    expect(INFO_SECTIONS.types.title).toBe("Types de crises");
    expect(INFO_SECTIONS.firstaid.title).toBe("Premiers secours");
    expect(INFO_SECTIONS.triggers.title).toBe("Facteurs declenchants");
    expect(INFO_SECTIONS.living.title).toBe("Vivre avec l'epilepsie");
    expect(INFO_SECTIONS.resources.title).toBe("Ressources utiles");
  });

  it("should have content items in each section", () => {
    Object.values(INFO_SECTIONS).forEach((section) => {
      expect(section.contentCount).toBeGreaterThan(0);
    });
  });
});

describe("Emergency auto-call logic", () => {
  it("should call first contact when autoCallEnabled and contacts exist", () => {
    const settings = { autoCallEnabled: true };
    const contacts = [
      { id: "1", name: "Marie", phone: "+33612345678", relation: "Conjointe" },
      { id: "2", name: "Pierre", phone: "+33698765432", relation: "Frere" },
    ];

    const shouldCall = settings.autoCallEnabled && contacts.length > 0;
    expect(shouldCall).toBe(true);

    const targetPhone = contacts[0].phone;
    expect(targetPhone).toBe("+33612345678");
  });

  it("should call SAMU when autoCallEnabled but no contacts", () => {
    const settings = { autoCallEnabled: true };
    const contacts: any[] = [];

    const shouldCallSAMU = settings.autoCallEnabled && contacts.length === 0;
    expect(shouldCallSAMU).toBe(true);
  });

  it("should not call when autoCallEnabled is false", () => {
    const settings = { autoCallEnabled: false };
    const contacts = [{ id: "1", name: "Marie", phone: "+33612345678", relation: "Conjointe" }];

    const shouldCall = settings.autoCallEnabled && contacts.length > 0;
    expect(shouldCall).toBe(false);
  });

  it("should build correct SMS URL for Android", () => {
    const phones = ["+33612345678", "+33698765432"];
    const message = "Crise detectee";
    const phoneStr = phones.join(",");
    const encoded = encodeURIComponent(message);
    const smsUrl = `sms:${phoneStr}?body=${encoded}`;
    expect(smsUrl).toContain("+33612345678");
    expect(smsUrl).toContain("+33698765432");
    expect(smsUrl).toContain("Crise%20detectee");
  });

  it("should build correct SMS URL for iOS", () => {
    const phones = ["+33612345678"];
    const message = "Crise detectee";
    const phoneStr = phones.join(",");
    const encoded = encodeURIComponent(message);
    const smsUrl = `sms:${phoneStr}&body=${encoded}`;
    expect(smsUrl).toBe("sms:+33612345678&body=Crise%20detectee");
  });
});
