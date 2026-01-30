import "@/global.css";
import { useEffect, useRef } from "react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { env } from "@life-os/env/native";
import { ConvexReactClient } from "convex/react";
import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider } from "@/contexts/app-theme-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { authClient } from "@/lib/auth-client";

export const unstable_settings = {
  initialRouteName: "boot",
};

const convex = new ConvexReactClient(env.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

function StackLayout() {
  const { user, hasHydrated } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const hasForcedBootRef = useRef(false);
  const bootTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoggedIn = hasHydrated && !!user;
  const canAccessAuthRoutes = hasHydrated && isLoggedIn;
  const canAccessGuestRoutes = hasHydrated && !isLoggedIn;

  useEffect(() => {
    if (!navigationState?.key || hasForcedBootRef.current) {
      return;
    }

    if (segments[0] === "boot") {
      hasForcedBootRef.current = true;
      if (bootTimeoutRef.current) {
        clearTimeout(bootTimeoutRef.current);
        bootTimeoutRef.current = null;
      }
      return;
    }

    if (!bootTimeoutRef.current) {
      bootTimeoutRef.current = setTimeout(() => {
        router.replace("/boot");
        hasForcedBootRef.current = true;
        bootTimeoutRef.current = null;
      }, 450);
    }

    return () => {
      if (bootTimeoutRef.current) {
        clearTimeout(bootTimeoutRef.current);
        bootTimeoutRef.current = null;
      }
    };
  }, [navigationState?.key, router, segments]);

  return (
    <Stack initialRouteName="index" screenOptions={{}}>
      <Stack.Screen name="boot" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={canAccessAuthRoutes}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{
            presentation: "transparentModal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="add-busy-time"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="edit-busy-time"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="import-calendar"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={canAccessGuestRoutes}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function Layout() {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <AuthProvider>
            <AppThemeProvider>
              <HeroUINativeProvider>
                <StackLayout />
              </HeroUINativeProvider>
            </AppThemeProvider>
          </AuthProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ConvexBetterAuthProvider>
  );
}
