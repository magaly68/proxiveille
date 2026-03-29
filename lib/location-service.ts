import * as Location from "expo-location";
import { Platform } from "react-native";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  timestamp: number;
}

export interface LocationResult {
  success: boolean;
  location: LocationData | null;
  error?: string;
  googleMapsUrl?: string;
  address?: string;
}

/**
 * Request foreground location permission.
 * Returns true if permission was granted.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      // Web uses browser geolocation API
      if (!window.navigator.geolocation) {
        return false;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Check if location permission is already granted.
 */
export async function checkLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Check if location services are enabled on the device.
 */
export async function isLocationEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

/**
 * Get the current device location.
 * Automatically requests permission if not already granted.
 * Returns location data with Google Maps URL.
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  try {
    // Check if location services are enabled
    const servicesEnabled = await isLocationEnabled();
    if (!servicesEnabled) {
      return {
        success: false,
        location: null,
        error: "Les services de localisation sont desactives sur votre appareil.",
      };
    }

    // Check/request permission
    const hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) {
        return {
          success: false,
          location: null,
          error: "Permission de localisation refusee.",
        };
      }
    }

    // Get current position with high accuracy
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const locationData: LocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      timestamp: position.timestamp,
    };

    const googleMapsUrl = generateGoogleMapsUrl(
      locationData.latitude,
      locationData.longitude
    );

    return {
      success: true,
      location: locationData,
      googleMapsUrl,
    };
  } catch (error: any) {
    return {
      success: false,
      location: null,
      error: error.message || "Impossible d'obtenir la position GPS.",
    };
  }
}

/**
 * Get the current location quickly (lower accuracy but faster).
 * Useful during emergency situations where speed matters.
 */
export async function getQuickLocation(): Promise<LocationResult> {
  try {
    const hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) {
        return {
          success: false,
          location: null,
          error: "Permission de localisation refusee.",
        };
      }
    }

    // Use balanced accuracy for faster response
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const locationData: LocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      timestamp: position.timestamp,
    };

    const googleMapsUrl = generateGoogleMapsUrl(
      locationData.latitude,
      locationData.longitude
    );

    return {
      success: true,
      location: locationData,
      googleMapsUrl,
    };
  } catch (error: any) {
    return {
      success: false,
      location: null,
      error: error.message || "Impossible d'obtenir la position GPS.",
    };
  }
}

/**
 * Try to reverse geocode a location to get a human-readable address.
 */
export async function getAddressFromLocation(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    if (results && results.length > 0) {
      const addr = results[0];
      const parts: string[] = [];

      if (addr.streetNumber) parts.push(addr.streetNumber);
      if (addr.street) parts.push(addr.street);
      if (addr.city) parts.push(addr.city);
      if (addr.postalCode) parts.push(addr.postalCode);
      if (addr.region) parts.push(addr.region);
      if (addr.country) parts.push(addr.country);

      return parts.join(", ") || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a Google Maps URL from coordinates.
 * This URL is clickable in SMS and opens directly in Google Maps.
 */
export function generateGoogleMapsUrl(
  latitude: number,
  longitude: number
): string {
  return `https://maps.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * Format location data for inclusion in an SMS message.
 * Returns a formatted string with coordinates and Google Maps link.
 */
export function formatLocationForSms(location: LocationData): string {
  const mapsUrl = generateGoogleMapsUrl(location.latitude, location.longitude);
  const accuracy = location.accuracy
    ? ` (precision: ~${Math.round(location.accuracy)}m)`
    : "";
  return `Position GPS${accuracy}: ${mapsUrl}`;
}

/**
 * Get location and format it for emergency SMS.
 * This is the main function to call during a crisis.
 * Returns both the location data and the formatted SMS text.
 */
export async function getEmergencyLocation(): Promise<{
  location: LocationData | null;
  smsText: string;
  googleMapsUrl: string | null;
  address: string | null;
}> {
  // Try quick location first for speed
  const result = await getQuickLocation();

  if (!result.success || !result.location) {
    return {
      location: null,
      smsText: "Position GPS non disponible.",
      googleMapsUrl: null,
      address: null,
    };
  }

  const smsText = formatLocationForSms(result.location);

  // Try to get address in parallel (non-blocking)
  let address: string | null = null;
  try {
    address = await getAddressFromLocation(
      result.location.latitude,
      result.location.longitude
    );
  } catch {
    // Address is optional, don't fail if geocoding fails
  }

  return {
    location: result.location,
    smsText,
    googleMapsUrl: result.googleMapsUrl || null,
    address,
  };
}
