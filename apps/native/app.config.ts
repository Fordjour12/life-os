import type { ExpoConfig } from "expo/config";

const appEnv = process.env.APP_ENV ?? "development";
const isDev = appEnv === "development";
const isPreview = appEnv === "preview";
const isProd = appEnv === "production";

const getBundleIdentifier = () => {
  if (isDev) return "com.thedevelophantom.monthlyzen.dev";
  if (isPreview) return "com.thedevelophantom.monthlyzen.preview";
  return "com.thedevelophantom.monthlyzen";
};

const config: ExpoConfig = {
  scheme: isProd ? "life-os" : "life-os-dev",
  userInterfaceStyle: "automatic",
  orientation: "default",
  web: {
    bundler: "metro",
  },
  name: isProd ? "life-os" : "life-os (dev)",
  slug: isProd ? "life-os" : "life-os-dev",
  plugins: ["expo-font", "expo-router", "expo-secure-store"],
  ios: {
    bundleIdentifier: getBundleIdentifier(),
  },
  android: {
    package: getBundleIdentifier(),
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
