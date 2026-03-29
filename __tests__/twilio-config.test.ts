import { describe, it, expect } from "vitest";

describe("Twilio Configuration", () => {
  it("should have TWILIO_ACCOUNT_SID set", () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    expect(sid).toBeDefined();
    expect(typeof sid).toBe("string");
    expect(sid!.length).toBeGreaterThan(0);
    // Twilio Account SIDs start with "AC"
    expect(sid!.startsWith("AC")).toBe(true);
  });

  it("should have TWILIO_AUTH_TOKEN set", () => {
    const token = process.env.TWILIO_AUTH_TOKEN;
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(0);
  });

  it("should have TWILIO_PHONE_NUMBER set in E.164 format", () => {
    const phone = process.env.TWILIO_PHONE_NUMBER;
    expect(phone).toBeDefined();
    expect(typeof phone).toBe("string");
    expect(phone!.length).toBeGreaterThan(0);
    // E.164 format starts with +
    expect(phone!.startsWith("+")).toBe(true);
  });

  it("should be able to authenticate with Twilio API", async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    if (!sid || !token) {
      console.warn("Twilio credentials not set, skipping API test");
      return;
    }

    // Make a lightweight API call to verify credentials
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
      {
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        },
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sid).toBe(sid);
    expect(data.status).toBe("active");
  });
});
