import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Todo",
  slug: "shubrt-todo",
  version: "0.1.0",
  scheme: "todo",
  icon: "./assets/icon.png",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "dev.shubrt.todo",
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: "dev.shubrt.todo",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#D5E69D" },
  },
  plugins: ["expo-secure-store", "./plugins/withTodoHabitSurfaces.cjs"],
  experiments: { autolinkingModuleResolution: true },
};

export default config;
