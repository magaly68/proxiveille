// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // This rule is mostly useful for web HTML output and is noisy in React Native
      // screen copy where apostrophes in <Text> nodes are perfectly valid.
      "react/no-unescaped-entities": "off",
    },
  },
]);
