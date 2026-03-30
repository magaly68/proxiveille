import "../scripts/load-env.js";
import { describe, it, expect } from "vitest";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const phone = process.env.TWILIO_PHONE_NUMBER;

const hasAnyTwilioEnv = [sid, token, phone].some(Boolean);
const hasFullTwilioEnv = [sid, token, phone].every(Boolean);

describe("Twilio Configuration", () => {
  it("should expose either a complete Twilio config or none at all", () => {
    expect(hasAnyTwilioEnv && !hasFullTwilioEnv).toBe(false);
  });

  it("should validate the SID format when Twilio is configured", () => {
    if (!hasFullTwilioEnv) {
      return;
    }

    expect(typeof sid).toBe("string");
    expect(sid!.length).toBeGreaterThan(0);
    expect(sid!.startsWith("AC")).toBe(true);
  });

  it("should validate the phone number format when Twilio is configured", () => {
    if (!hasFullTwilioEnv) {
      return;
    }

    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(0);
    expect(typeof phone).toBe("string");
    expect(phone!.length).toBeGreaterThan(0);
    expect(phone!.startsWith("+")).toBe(true);
  });

  it("should be able to authenticate with Twilio API", async () => {
    if (!hasFullTwilioEnv) {
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
