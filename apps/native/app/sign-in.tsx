import { Link, useRouter } from "expo-router";
import { Button, ErrorView, Spinner, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Container } from "@/components/container";
import { MachineText } from "@/components/ui/machine-text";
import { useAuth } from "@/contexts/auth-context";
import { formatLongDate } from "@/lib/date";

export default function SignInScreen() {
  const router = useRouter();
  const currentDate = formatLongDate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signIn, isLoading, error, clearError, user } = useAuth();

  useEffect(() => {
    if (user) {
      router.replace("/(tabs)");
    }
  }, [user, router]);

  const handleLogin = async () => {
    clearError();
    await signIn({ email, password });
    setEmail("");
    setPassword("");
  };

  return (
    <Container className="bg-background">
      <View className="flex-1 px-4 pt-20 pb-10 gap-6">
        <View className="pb-4 border-b-2 border-divider">
          <MachineText variant="header" size="2xl" className="mb-1">
            SESSION_GATE
          </MachineText>
          <MachineText variant="label">{currentDate}</MachineText>
        </View>

        <View className="gap-4">
          <MachineText className="text-xs text-muted-foreground">
            SIGN IN TO CONTINUE YOUR DAILY RECOVERY FLOW.
          </MachineText>

          <View className="p-4 bg-surface border border-foreground shadow-[4px_4px_0px_var(--color-foreground)]">
            <MachineText variant="header" className="mb-4">
              SESSION_START
            </MachineText>

            <ErrorView isInvalid={!!error} className="mb-3">
              {error}
            </ErrorView>

            <View className="gap-4">
              <View>
                <MachineText variant="label" className="mb-1">
                  IDENTITY_UID
                </MachineText>
                <View className="bg-muted border border-divider p-1">
                  <TextField>
                    <TextField.Input
                      value={email}
                      onChangeText={setEmail}
                      placeholder="USER@DOMAIN.COM"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="font-mono text-sm py-2"
                      style={{ fontFamily: "Menlo" }}
                    />
                  </TextField>
                </View>
              </View>

              <View>
                <MachineText variant="label" className="mb-1">
                  ACCESS_KEY
                </MachineText>
                <View className="bg-muted border border-divider p-1">
                  <TextField>
                    <TextField.Input
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      secureTextEntry
                      className="font-mono text-sm py-2"
                      style={{ fontFamily: "Menlo" }}
                    />
                  </TextField>
                </View>
              </View>

              <Button
                onPress={handleLogin}
                isDisabled={isLoading}
                className="mt-2 bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)] h-12"
              >
                {isLoading ? (
                  <View className="flex-row gap-2 items-center">
                    <Spinner size="sm" color="white" />
                    <MachineText className="text-background font-bold">
                      INITIATING_HANDSHAKE ....
                    </MachineText>
                  </View>
                ) : (
                  <MachineText className="text-background font-bold">
                    INITIATE_HANDSHAKE
                  </MachineText>
                )}
              </Button>
            </View>
          </View>

          <View className="items-center">
            <MachineText variant="label">-- OR --</MachineText>
          </View>

          <Link href="/sign-up" asChild>
            <Button className="bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)] h-12">
              <MachineText className="text-background font-bold">CREATE_NEW_IDENTITY</MachineText>
            </Button>
          </Link>
        </View>
      </View>
    </Container>
  );
}
