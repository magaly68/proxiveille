/**
 * useSmartWatch Hook
 * Manages BLE connection to smartwatches for heart rate monitoring.
 * Uses react-native-ble-plx for Bluetooth Low Energy communication.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BLE_SERVICES,
  BLE_CHARACTERISTICS,
  smartWatchReducer,
  initialSmartWatchState,
  parseHeartRateData,
  savePairedDevice,
  loadPairedDevice,
  removePairedDevice,
  analyzeHeartRateForSeizure,
  type BLEDevice,
  type PairedDevice,
  type HeartRateData,
  type SmartWatchState,
} from "@/lib/smartwatch-service";

// Conditionally import BleManager only on native platforms
let BleManager: any = null;
let bleManagerInstance: any = null;

async function getBleManager() {
  if (Platform.OS === "web") return null;
  if (bleManagerInstance) return bleManagerInstance;
  try {
    const module = await import("react-native-ble-plx");
    BleManager = module.BleManager;
    bleManagerInstance = new BleManager();
    return bleManagerInstance;
  } catch {
    return null;
  }
}

const SCAN_TIMEOUT = 15000; // 15 seconds scan timeout

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  if (Number(Platform.Version) >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function useSmartWatch() {
  const [state, dispatch] = useReducer(
    smartWatchReducer,
    initialSmartWatchState,
  );
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hrSubscriptionRef = useRef<any>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  // Load previously paired device on mount
  useEffect(() => {
    const loadSaved = async () => {
      const saved = await loadPairedDevice();
      if (saved) {
        dispatch({ type: "SET_DEVICE", payload: saved });
        // Try to auto-reconnect
        autoReconnect(saved.id);
      }
    };
    loadSaved();

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(async () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    if (hrSubscriptionRef.current) {
      hrSubscriptionRef.current.remove();
      hrSubscriptionRef.current = null;
    }
    const manager = await getBleManager();
    if (manager) {
      try {
        manager.stopDeviceScan();
      } catch {
        // Ignore
      }
    }
  }, []);

  /**
   * Start scanning for BLE devices with Heart Rate service
   */
  const startScan = useCallback(async () => {
    const hasPermissions = await requestBlePermissions();
    if (!hasPermissions) {
      dispatch({
        type: "SET_ERROR",
        payload: "Autorisez le Bluetooth pour rechercher votre montre",
      });
      return;
    }

    const manager = await getBleManager();
    if (!manager) {
      dispatch({
        type: "SET_ERROR",
        payload: "Bluetooth non disponible sur cette plateforme",
      });
      return;
    }

    dispatch({ type: "SET_SCANNING", payload: true });
    dispatch({ type: "CLEAR_DISCOVERED_DEVICES" });

    try {
      // Check Bluetooth state
      const btState = await manager.state();
      if (btState !== "PoweredOn") {
        dispatch({
          type: "SET_ERROR",
          payload: "Veuillez activer le Bluetooth sur votre appareil",
        });
        return;
      }

      // Start scanning for devices with Heart Rate Service
      manager.startDeviceScan(
        [BLE_SERVICES.HEART_RATE],
        { allowDuplicates: false },
        (error: any, device: any) => {
          if (error) {
            dispatch({
              type: "SET_ERROR",
              payload: `Erreur de scan: ${error.message}`,
            });
            return;
          }

          if (device && (device.name || device.localName)) {
            const bleDevice: BLEDevice = {
              id: device.id,
              name: device.name || device.localName,
              rssi: device.rssi,
              isConnectable: device.isConnectable ?? true,
            };
            dispatch({ type: "ADD_DISCOVERED_DEVICE", payload: bleDevice });
          }
        },
      );

      // Auto-stop scan after timeout
      scanTimeoutRef.current = setTimeout(() => {
        stopScan();
      }, SCAN_TIMEOUT);
    } catch (error: any) {
      dispatch({
        type: "SET_ERROR",
        payload: `Impossible de demarrer le scan: ${error.message}`,
      });
    }
  }, []);

  /**
   * Stop scanning for BLE devices
   */
  const stopScan = useCallback(async () => {
    const manager = await getBleManager();
    if (manager) {
      try {
        manager.stopDeviceScan();
      } catch {
        // Ignore
      }
    }
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    dispatch({ type: "SET_SCANNING", payload: false });
  }, []);

  /**
   * Connect to a specific BLE device
   */
  const connectToDevice = useCallback(
    async (deviceId: string, deviceName: string) => {
      const manager = await getBleManager();
      if (!manager) return;

      await stopScan();

      try {
        dispatch({ type: "SET_ERROR", payload: null });

        // Connect to device
        const device = await manager.connectToDevice(deviceId, {
          requestMTU: 512,
          timeout: 10000,
        });

        // Discover services and characteristics
        await device.discoverAllServicesAndCharacteristics();

        // Save as paired device
        const pairedDevice: PairedDevice = {
          id: deviceId,
          name: deviceName,
          lastConnected: Date.now(),
        };
        await savePairedDevice(pairedDevice);

        dispatch({ type: "SET_DEVICE", payload: pairedDevice });
        dispatch({ type: "SET_CONNECTED", payload: true });
        reconnectAttempts.current = 0;

        // Start monitoring heart rate
        await subscribeToHeartRate(device);

        // Read battery level
        await readBatteryLevel(device);

        // Monitor disconnection
        manager.onDeviceDisconnected(deviceId, (error: any) => {
          dispatch({ type: "SET_CONNECTED", payload: false });
          if (hrSubscriptionRef.current) {
            hrSubscriptionRef.current.remove();
            hrSubscriptionRef.current = null;
          }
          // Try to auto-reconnect
          if (reconnectAttempts.current < maxReconnectAttempts) {
            setTimeout(() => autoReconnect(deviceId), 3000);
          }
        });
      } catch (error: any) {
        dispatch({
          type: "SET_ERROR",
          payload: `Connexion echouee: ${error.message}`,
        });
        dispatch({ type: "SET_CONNECTED", payload: false });
      }
    },
    [],
  );

  /**
   * Subscribe to heart rate notifications
   */
  const subscribeToHeartRate = useCallback(async (device: any) => {
    try {
      hrSubscriptionRef.current = device.monitorCharacteristicForService(
        BLE_SERVICES.HEART_RATE,
        BLE_CHARACTERISTICS.HEART_RATE_MEASUREMENT,
        (error: any, characteristic: any) => {
          if (error) {
            console.log("HR monitoring error:", error.message);
            return;
          }
          if (characteristic?.value) {
            const hrData = parseHeartRateData(characteristic.value);
            if (hrData && hrData.bpm > 0 && hrData.bpm < 250) {
              dispatch({ type: "SET_HEART_RATE", payload: hrData });
            }
          }
        },
      );
    } catch (error: any) {
      console.log("Failed to subscribe to HR:", error.message);
    }
  }, []);

  /**
   * Read battery level from device
   */
  const readBatteryLevel = useCallback(async (device: any) => {
    try {
      const characteristic = await device.readCharacteristicForService(
        BLE_SERVICES.BATTERY,
        BLE_CHARACTERISTICS.BATTERY_LEVEL,
      );
      if (characteristic?.value) {
        const bytes = atob(characteristic.value);
        const level = bytes.charCodeAt(0);
        dispatch({ type: "SET_BATTERY_LEVEL", payload: level });
      }
    } catch {
      // Battery service may not be available on all devices
    }
  }, []);

  /**
   * Auto-reconnect to previously paired device
   */
  const autoReconnect = useCallback(async (deviceId: string) => {
    const manager = await getBleManager();
    if (!manager) return;

    reconnectAttempts.current += 1;

    try {
      const btState = await manager.state();
      if (btState !== "PoweredOn") return;

      const isConnected = await manager.isDeviceConnected(deviceId);
      if (isConnected) {
        dispatch({ type: "SET_CONNECTED", payload: true });
        return;
      }

      const device = await manager.connectToDevice(deviceId, {
        requestMTU: 512,
        timeout: 10000,
      });
      await device.discoverAllServicesAndCharacteristics();

      dispatch({ type: "SET_CONNECTED", payload: true });
      reconnectAttempts.current = 0;

      await subscribeToHeartRate(device);
      await readBatteryLevel(device);

      // Monitor disconnection
      manager.onDeviceDisconnected(deviceId, () => {
        dispatch({ type: "SET_CONNECTED", payload: false });
        if (hrSubscriptionRef.current) {
          hrSubscriptionRef.current.remove();
          hrSubscriptionRef.current = null;
        }
        if (reconnectAttempts.current < maxReconnectAttempts) {
          setTimeout(() => autoReconnect(deviceId), 5000);
        }
      });
    } catch {
      // Silent fail, will retry
      if (reconnectAttempts.current < maxReconnectAttempts) {
        setTimeout(() => autoReconnect(deviceId), 5000);
      }
    }
  }, []);

  /**
   * Disconnect from current device
   */
  const disconnect = useCallback(async () => {
    const manager = await getBleManager();
    if (!manager || !state.connectedDevice) return;

    try {
      if (hrSubscriptionRef.current) {
        hrSubscriptionRef.current.remove();
        hrSubscriptionRef.current = null;
      }
      await manager.cancelDeviceConnection(state.connectedDevice.id);
    } catch {
      // Ignore
    }

    dispatch({ type: "SET_CONNECTED", payload: false });
  }, [state.connectedDevice]);

  /**
   * Forget paired device (disconnect + remove from storage)
   */
  const forgetDevice = useCallback(async () => {
    await disconnect();
    await removePairedDevice();
    dispatch({ type: "RESET" });
  }, [disconnect]);

  /**
   * Get seizure analysis from heart rate data
   */
  const getHeartRateAnalysis = useCallback(() => {
    return analyzeHeartRateForSeizure(state.heartRateHistory);
  }, [state.heartRateHistory]);

  return {
    state,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    forgetDevice,
    getHeartRateAnalysis,
  };
}
