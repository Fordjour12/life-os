import { Button, ErrorView, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/contexts/auth-context";
import { MachineText } from "@/components/ui/machine-text";

export function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signUp, isLoading, error, clearError } = useAuth();

  const handleSignUp = async () => {
    clearError();
    await signUp({ name, email, password });
    setName("");
    setEmail("");
    setPassword("");
  };

  return (
    <View className="p-4 bg-surface border border-foreground shadow-[4px_4px_0px_var(--color-foreground)]">
      <MachineText variant="header" className="mb-4">NEW_IDENTITY_PROVISIONING</MachineText>

      <ErrorView isInvalid={!!error} className="mb-3">
        {error}
      </ErrorView>

      <View className="gap-4">
        <View>
          <MachineText variant="label" className="mb-1">NAME_ID</MachineText>
          <View className="bg-muted border border-divider p-1">
            <TextField>
              <TextField.Input
                value={name}
                onChangeText={setName}
                placeholder="FIRST LAST"
                className="font-mono text-sm h-10"
                style={{ fontFamily: 'Menlo' }}
              />
            </TextField>
          </View>
        </View>

        <View>
          <MachineText variant="label" className="mb-1">EMAIL_UID</MachineText>
          <View className="bg-muted border border-divider p-1">
            <TextField>
              <TextField.Input
                value={email}
                onChangeText={setEmail}
                placeholder="USER@DOMAIN.COM"
                keyboardType="email-address"
                autoCapitalize="none"
                className="font-mono text-sm h-10"
                style={{ fontFamily: 'Menlo' }}
              />
            </TextField>
          </View>
        </View>

        <View>
          <MachineText variant="label" className="mb-1">KEY_PHRASE</MachineText>
          <View className="bg-muted border border-divider p-1">
            <TextField>
              <TextField.Input
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                className="font-mono text-sm h-10"
                style={{ fontFamily: 'Menlo' }}
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
            <Spinner size="sm" color="white" />
          ) : (
            <MachineText className="text-background font-bold">INITIATE_PROVISIONING</MachineText>
          )}
        </Button>
      </View>
    </View>
  );
}
