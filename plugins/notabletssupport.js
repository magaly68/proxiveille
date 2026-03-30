const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withNoTabletSupport(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    manifest["supports-screens"] = [
      {
        $: {
          "android:smallScreens": "true",
          "android:normalScreens": "true",
          "android:largeScreens": "false",
          "android:xlargeScreens": "false",
        },
      },
    ];

    return config;
  });
};
