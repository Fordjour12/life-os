import type { ExpoConfig } from "expo/config";

const appEnv = process.env.APP_ENV ?? "development";
const isDev = appEnv === "development";
const isPreview = appEnv === "preview";
const isProd = appEnv === "production";

const getBundleIdentifier = () => {
   if (isDev) return "com.thedevelophantom.lifeos.dev";
   if (isPreview) return "com.thedevelophantom.lifeos.preview";
   return "com.thedevelophantom.lifeos";
};

const config: ExpoConfig = {
   scheme: isProd ? "lifeos" : "lifeos-dev",
   userInterfaceStyle: "automatic",
   orientation: "default",
   web: {
      bundler: "metro",
   },
   name: isProd ? "Life OS" : "Life OS (Dev)",
   slug: isProd ? "lifeos" : "lifeos-dev",
   splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#EBEBE8",
   },
   plugins: [
      [
         "expo-font",
         {
            fonts: [
               "./assets/fonts/Raleway/Raleway-Thin.ttf",
               "./assets/fonts/Raleway/Raleway-ThinItalic.ttf",
               "./assets/fonts/Raleway/Raleway-Light.ttf",
               "./assets/fonts/Raleway/Raleway-LightItalic.ttf",
               "./assets/fonts/Raleway/Raleway-Regular.ttf",
               "./assets/fonts/Raleway/Raleway-Italic.ttf",
               "./assets/fonts/Raleway/Raleway-Medium.ttf",
               "./assets/fonts/Raleway/Raleway-MediumItalic.ttf",
               "./assets/fonts/Raleway/Raleway-SemiBold.ttf",
               "./assets/fonts/Raleway/Raleway-SemiBoldItalic.ttf",
               "./assets/fonts/Raleway/Raleway-Bold.ttf",
               "./assets/fonts/Raleway/Raleway-BoldItalic.ttf",
               "./assets/fonts/Raleway/Raleway-ExtraBold.ttf",
               "./assets/fonts/Raleway/Raleway-ExtraBoldItalic.ttf",
               "./assets/fonts/Raleway/Raleway-Black.ttf",
               "./assets/fonts/Raleway/Raleway-BlackItalic.ttf",
            ],
         },
      ],
      "expo-router",
      "expo-secure-store",
   ],
   ios: {
      bundleIdentifier: getBundleIdentifier(),
   },
   android: {
      adaptiveIcon: {
         backgroundColor: "#280541",
         foregroundImage: "./assets/images/android-icon-foreground.png",
         backgroundImage: "./assets/images/android-icon-background.png",
         monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      softwareKeyboardLayoutMode: "resize",
      package: getBundleIdentifier(),
   },
   experiments: {
      typedRoutes: true,
      reactCompiler: true,
   },
};

export default config;
