import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "com.magaly.epiguard.alert";
const easProjectId = "f1bc00c9-0885-4ddb-9503-d11957013803";
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
  appSlug: "proxiveille",
  logoUrl:
    "https://d2xsxph8kpxj0f.cloudfront.net/310419663032625063/DSxYszaYCKpUMzQdsJmyhQ/epiguard-icon-ZcRGAKr5qNefo6gbnSk896.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  owner: "magaly68",
  platforms: ["android"],
  version: "1.0.2",
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: `https://u.expo.dev/${easProjectId}`,
  },
  orientation: "portrait",
  icon: "./assets/images/proxiveille-icon.png",
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
      foregroundImage: "./assets/images/proxiveille-adaptive-foreground.png",
      backgroundColor: "#F7FAFC",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,

    versionCode: 8,

    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: env.scheme, host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "./plugins/notabletssupport",
    "expo-router",
    "expo-background-task",
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: true,
        neverForLocation: false,
        bluetoothAlwaysPermission: false,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "ProxiVeille a besoin de votre position pour l'inclure dans les alertes d'urgence envoyees a vos proches.",
        locationWhenInUsePermission:
          "ProxiVeille a besoin de votre position pour l'inclure dans les alertes d'urgence.",
      },
    ],

    [
      "expo-splash-screen",
      {
        image: "./assets/images/proxiveille-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: { backgroundColor: "#000000" },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  extra: {
    eas: {
      projectId: easProjectId,
    },
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
