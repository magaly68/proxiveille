import { useEffect, useCallback } from "react";
import { Platform } from "react-native";
import { useAppState } from "@/lib/app-context";

/**
 * Check if the current time is within the night mode window.
 * Handles overnight ranges like 22:00 → 07:00.
 */
function isInNightWindow(startTime: string, endTime: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range: e.g. 08:00 → 20:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range: e.g. 22:00 → 07:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Hook that manages night mode state.
 * - Checks every minute whether auto-activation should trigger.
 * - Exposes toggle and manual activation helpers.
 */
export function useNightMode() {
  const { state, dispatch } = useAppState();
  const { nightModeSettings, isNightModeActive } = state;

  // Auto-activate based on time
  useEffect(() => {
    if (!nightModeSettings.autoActivate) return;

    const check = () => {
      const shouldBeActive = isInNightWindow(
        nightModeSettings.startTime,
        nightModeSettings.endTime
      );
      if (shouldBeActive !== isNightModeActive) {
        dispatch({ type: "SET_NIGHT_MODE_ACTIVE", payload: shouldBeActive });
      }
    };

    check(); // immediate check on mount / settings change
    const interval = setInterval(check, 60_000); // re-check every minute
    return () => clearInterval(interval);
  }, [
    nightModeSettings.autoActivate,
    nightModeSettings.startTime,
    nightModeSettings.endTime,
    isNightModeActive,
    dispatch,
  ]);

  const toggleNightMode = useCallback(() => {
    dispatch({ type: "SET_NIGHT_MODE_ACTIVE", payload: !isNightModeActive });
  }, [isNightModeActive, dispatch]);

  const activateNightMode = useCallback(() => {
    dispatch({ type: "SET_NIGHT_MODE_ACTIVE", payload: true });
  }, [dispatch]);

  const deactivateNightMode = useCallback(() => {
    dispatch({ type: "SET_NIGHT_MODE_ACTIVE", payload: false });
  }, [dispatch]);

  return {
    isNightModeActive,
    nightModeSettings,
    toggleNightMode,
    activateNightMode,
    deactivateNightMode,
  };
}
