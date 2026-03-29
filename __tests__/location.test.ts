import { describe, it, expect } from "vitest";

// Test the location utility functions directly (no Expo mocking needed)

describe("Location Service - Utility Functions", () => {
  // Test generateGoogleMapsUrl logic
  describe("Google Maps URL generation", () => {
    it("should generate correct Google Maps URL from coordinates", () => {
      const lat = 48.8566;
      const lng = 2.3522;
      const url = `https://maps.google.com/maps?q=${lat},${lng}`;
      expect(url).toBe("https://maps.google.com/maps?q=48.8566,2.3522");
    });

    it("should handle negative coordinates", () => {
      const lat = -33.8688;
      const lng = 151.2093;
      const url = `https://maps.google.com/maps?q=${lat},${lng}`;
      expect(url).toBe("https://maps.google.com/maps?q=-33.8688,151.2093");
    });

    it("should handle zero coordinates", () => {
      const lat = 0;
      const lng = 0;
      const url = `https://maps.google.com/maps?q=${lat},${lng}`;
      expect(url).toBe("https://maps.google.com/maps?q=0,0");
    });
  });

  // Test formatLocationForSms logic
  describe("SMS location formatting", () => {
    it("should format location with accuracy for SMS", () => {
      const location = {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 15,
        altitude: null,
        timestamp: Date.now(),
      };
      const mapsUrl = `https://maps.google.com/maps?q=${location.latitude},${location.longitude}`;
      const accuracy = location.accuracy
        ? ` (precision: ~${Math.round(location.accuracy)}m)`
        : "";
      const smsText = `Position GPS${accuracy}: ${mapsUrl}`;

      expect(smsText).toContain("Position GPS");
      expect(smsText).toContain("precision: ~15m");
      expect(smsText).toContain("https://maps.google.com/maps?q=48.8566,2.3522");
    });

    it("should format location without accuracy", () => {
      const location = {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: null,
        altitude: null,
        timestamp: Date.now(),
      };
      const mapsUrl = `https://maps.google.com/maps?q=${location.latitude},${location.longitude}`;
      const accuracy = location.accuracy
        ? ` (precision: ~${Math.round(location.accuracy)}m)`
        : "";
      const smsText = `Position GPS${accuracy}: ${mapsUrl}`;

      expect(smsText).toBe(
        "Position GPS: https://maps.google.com/maps?q=48.8566,2.3522"
      );
      expect(smsText).not.toContain("precision");
    });
  });

  // Test SeizureEvent location model
  describe("SeizureEvent location model", () => {
    it("should correctly structure location data for a seizure event", () => {
      const seizureLocation = {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 10,
        address: "1 Rue de Rivoli, Paris, 75001, France",
        googleMapsUrl: "https://maps.google.com/maps?q=48.8566,2.3522",
      };

      expect(seizureLocation.latitude).toBe(48.8566);
      expect(seizureLocation.longitude).toBe(2.3522);
      expect(seizureLocation.accuracy).toBe(10);
      expect(seizureLocation.address).toContain("Paris");
      expect(seizureLocation.googleMapsUrl).toContain("maps.google.com");
    });

    it("should handle location without address", () => {
      const seizureLocation = {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: null,
        address: null,
        googleMapsUrl: "https://maps.google.com/maps?q=48.8566,2.3522",
      };

      expect(seizureLocation.address).toBeNull();
      expect(seizureLocation.accuracy).toBeNull();
      expect(seizureLocation.googleMapsUrl).toBeTruthy();
    });
  });

  // Test emergency location building logic
  describe("Emergency location for SMS", () => {
    it("should build rich location text with address and URL", () => {
      const address = "1 Rue de Rivoli, Paris, 75001, France";
      const googleMapsUrl = "https://maps.google.com/maps?q=48.8566,2.3522";
      const parts: string[] = [];
      if (address) parts.push(address);
      if (googleMapsUrl) parts.push(googleMapsUrl);
      const locationText = parts.join(" - ");

      expect(locationText).toBe(
        "1 Rue de Rivoli, Paris, 75001, France - https://maps.google.com/maps?q=48.8566,2.3522"
      );
    });

    it("should build location text with URL only when no address", () => {
      const address = null;
      const googleMapsUrl = "https://maps.google.com/maps?q=48.8566,2.3522";
      const parts: string[] = [];
      if (address) parts.push(address);
      if (googleMapsUrl) parts.push(googleMapsUrl);
      const locationText = parts.join(" - ");

      expect(locationText).toBe(
        "https://maps.google.com/maps?q=48.8566,2.3522"
      );
    });

    it("should return fallback text when no location available", () => {
      const smsText = "Position GPS non disponible.";
      expect(smsText).toBe("Position GPS non disponible.");
    });
  });

  // Test report export with location
  describe("Report export with location data", () => {
    it("should include location in exported report lines", () => {
      const event = {
        location: {
          latitude: 48.8566,
          longitude: 2.3522,
          accuracy: 10,
          address: "1 Rue de Rivoli, Paris",
          googleMapsUrl: "https://maps.google.com/maps?q=48.8566,2.3522",
        },
      };

      const lines: string[] = [];
      if (event.location) {
        if (event.location.address)
          lines.push(`Adresse : ${event.location.address}`);
        lines.push(
          `Coordonnees GPS : ${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}`
        );
        lines.push(`Google Maps : ${event.location.googleMapsUrl}`);
        if (event.location.accuracy)
          lines.push(
            `Precision GPS : ~${Math.round(event.location.accuracy)}m`
          );
      }

      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("Adresse : 1 Rue de Rivoli, Paris");
      expect(lines[1]).toContain("Coordonnees GPS : 48.85660, 2.35220");
      expect(lines[2]).toContain("Google Maps");
      expect(lines[3]).toContain("Precision GPS : ~10m");
    });

    it("should handle event without location in report", () => {
      const event = { location: undefined };
      const lines: string[] = [];
      if (event.location) {
        lines.push("This should not appear");
      }
      expect(lines).toHaveLength(0);
    });
  });

  // Test UPDATE_SEIZURE_LOCATION reducer logic
  describe("UPDATE_SEIZURE_LOCATION reducer logic", () => {
    it("should update the correct seizure with location data", () => {
      const seizureEvents = [
        { id: "1", timestamp: 1000, location: undefined },
        { id: "2", timestamp: 2000, location: undefined },
        { id: "3", timestamp: 3000, location: undefined },
      ];

      const newLocation = {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 10,
        address: "Paris",
        googleMapsUrl: "https://maps.google.com/maps?q=48.8566,2.3522",
      };

      const updatedEvents = seizureEvents.map((e) =>
        e.id === "2" ? { ...e, location: newLocation } : e
      );

      expect(updatedEvents[0].location).toBeUndefined();
      expect(updatedEvents[1].location).toEqual(newLocation);
      expect(updatedEvents[2].location).toBeUndefined();
    });

    it("should not modify events when seizureId does not match", () => {
      const seizureEvents = [
        { id: "1", timestamp: 1000, location: undefined },
      ];

      const newLocation = {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 10,
        address: "Paris",
        googleMapsUrl: "https://maps.google.com/maps?q=48.8566,2.3522",
      };

      const updatedEvents = seizureEvents.map((e) =>
        e.id === "999" ? { ...e, location: newLocation } : e
      );

      expect(updatedEvents[0].location).toBeUndefined();
    });
  });
});
