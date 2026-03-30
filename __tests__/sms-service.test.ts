import { describe, expect, it } from "vitest";
import { normalizePhoneNumber } from "../server/sms-service";

describe("normalizePhoneNumber", () => {
  it("keeps a valid E.164 number unchanged", () => {
    expect(normalizePhoneNumber("+33612345678")).toBe("+33612345678");
  });

  it("normalizes spaces and separators", () => {
    expect(normalizePhoneNumber("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhoneNumber("+33-(0)6.12.34.56.78")).toBe("+33612345678");
  });

  it("converts a 00 prefix to +", () => {
    expect(normalizePhoneNumber("0033612345678")).toBe("+33612345678");
  });

  it("rejects numbers that are not already international", () => {
    expect(normalizePhoneNumber("0612345678")).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
  });
});
