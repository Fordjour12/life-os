import "@/global.css";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { env } from "@life-os/env/native";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider } from "@/contexts/app-theme-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { authClient } from "@/lib/auth-client";
import { KernelProvider } from "@/lib/kernel-provider";
import { BootGate } from "@/components/boot-gate";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

const convex = new ConvexReactClient(env.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

function StackLayout() {
  const router = useRouter();
  const { user } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const isLoggedIn = !!user && isAuthenticated;
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (isLoggedIn) {
      wasAuthenticatedRef.current = true;
      return;
    }
    if (wasAuthenticatedRef.current) {
      router.replace("/sign-in");
      wasAuthenticatedRef.current = false;
    }
  }, [isLoggedIn, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isLoggedIn}>
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
          name="new-task"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function Layout() {
  return (
    <BootGate>
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AuthProvider>
              <AppThemeProvider>
                <HeroUINativeProvider>
                  <KernelProvider>
                    <StackLayout />
                  </KernelProvider>
                </HeroUINativeProvider>
              </AppThemeProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ConvexBetterAuthProvider>
    </BootGate>
  );
}
