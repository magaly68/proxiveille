import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "com.magaly.epiguard.alert";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";

const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  appName: "ProxiVeille",
  appSlug: "epilepsy-guard",
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310419663032625063/DSxYszaYCKpUMzQdsJmyhQ/epiguard-icon-ZcRGAKr5qNefo6gbnSk896.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  platforms: ["android"],
  version: "1.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#2C3E7A",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    // Permissions inutiles pour la version actuelle (alerte manuelle, journal,
    // traitement). Les retirer evite des declarations supplementaires sur
    // Google Play (service de premier plan, micro, superposition d'ecran...).
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.HIGH_SAMPLING_RATE_SENSORS",
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
    ],

    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: env.scheme, host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "./plugins/notabletssupport",
    "expo-router",
    "expo-background-task",
    ["expo-location", {
      locationWhenInUsePermission: "ProxiVeille utilise votre position uniquement pour l'ajouter au SMS d'alerte envoye a vos proches.",
    }],
    ["expo-splash-screen", {
      image: "./assets/images/splash-icon.png",
      imageWidth: 200,
      resizeMode: "contain",
      backgroundColor: "#ffffff",
      dark: { backgroundColor: "#000000" },
    }],
    ["expo-build-properties", {
      android: {
        buildArchs: ["armeabi-v7a", "arm64-v8a"],
        minSdkVersion: 24,
      },
    }],
  ],
  extra: {
    eas: {
      projectId: "ed1f26bc-8095-4f89-a1fe-d45e8ad4eee5"
    }
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
