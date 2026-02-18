import { Link, useRouter } from "expo-router";
import { Button, ErrorView, Spinner, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useConvexAuth } from "convex/react";

import { Container } from "@/components/container";
import { MachineText } from "@/components/ui/machine-text";
import { useAuth } from "@/contexts/auth-context";
import { formatLongDate } from "@/lib/date";

export default function SignUpScreen() {
  const router = useRouter();
  const currentDate = formatLongDate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signUp, isLoading, error, clearError, user } = useAuth();
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (user && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, user, router]);

  const handleSignUp = async () => {
    clearError();
    await signUp({ name, email, password });
    setName("");
    setEmail("");
    setPassword("");
  };

  return (
    <Container className="bg-background">
      <View className="flex-1 px-4 pt-20 pb-10 gap-6">
        <View className="pb-4 border-b-2 border-divider">
          <MachineText variant="header" size="2xl" className="mb-1">
            IDENTITY_PROVISIONING
          </MachineText>
          <MachineText variant="label">{currentDate}</MachineText>
        </View>

        <View className="gap-4">
          <MachineText className="text-xs text-muted-foreground">
            CREATE A NEW IDENTITY TO ACCESS YOUR RECOVERY-FIRST SYSTEM.
          </MachineText>

          <View className="p-4 bg-surface border border-foreground shadow-[4px_4px_0px_var(--color-foreground)]">
            <MachineText variant="header" className="mb-4">
              NEW_IDENTITY_PROVISIONING
            </MachineText>

            <ErrorView isInvalid={!!error} className="mb-3">
              {error}
            </ErrorView>

            <View className="gap-4">
              <View>
                <MachineText variant="label" className="mb-1">
                  NAME_ID
                </MachineText>
                <View className="bg-muted border border-divider p-1">
                  <TextField>
                    <TextField.Input
                      value={name}
                      onChangeText={setName}
                      placeholder="FIRST LAST"
                      className="font-mono text-sm py-2"
                      style={{ fontFamily: "Menlo" }}
                    />
                  </TextField>
                </View>
              </View>

              <View>
                <MachineText variant="label" className="mb-1">
                  EMAIL_UID
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
                  KEY_PHRASE
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
                onPress={handleSignUp}
                isDisabled={isLoading}
                className="mt-2 bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)] h-12"
              >
                {isLoading ? (
                  <View className="flex-row gap-2 items-center">
                    <Spinner size="sm" color="white" />
                    <MachineText className="text-background font-bold">
                      PROVISIONING ....
                    </MachineText>
                  </View>
                ) : (
                  <MachineText className="text-background font-bold">
                    INITIATE_PROVISIONING
                  </MachineText>
                )}
              </Button>
            </View>
          </View>

          <View className="items-center">
            <MachineText variant="label">-- OR --</MachineText>
          </View>

          <Link href="/sign-in" asChild>
            <Button className="bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)] h-12">
              <MachineText className="text-background font-bold">USE_EXISTING_ID</MachineText>
            </Button>
          </Link>
        </View>
      </View>
    </Container>
  );
}
