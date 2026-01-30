import { Button, ErrorView, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { MachineText } from "@/components/ui/machine-text";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    await authClient.signIn.email(
      {
        email,
        password,
      },
      {
        onError: (error) => {
          setError(error.error?.message || "Failed to sign in");
          setIsLoading(false);
        },
        onSuccess: () => {
          setEmail("");
          setPassword("");
        },
        onFinished: () => {
          setIsLoading(false);
        },
      },
    );
  };

  return (
    <View className="p-4 bg-white border border-black shadow-[4px_4px_0px_black]">
      <MachineText variant="header" className="mb-4">SESSION_START</MachineText>

      <ErrorView isInvalid={!!error} className="mb-3">
        {error}
      </ErrorView>

      <View className="gap-4">
        <View>
          <MachineText variant="label" className="mb-1">IDENTITY_UID</MachineText>
          <View className="bg-black/5 border border-black/10 p-1">
            <TextField>
              <TextField.Input
                value={email}
                onChangeText={setEmail}
                placeholder="USER@DOMAIN.COM"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                className="font-mono text-sm h-10"
                style={{ fontFamily: 'Menlo' }}
              />
            </TextField>
          </View>
        </View>

        <View>
          <MachineText variant="label" className="mb-1">ACCESS_KEY</MachineText>
          <View className="bg-black/5 border border-black/10 p-1">
            <TextField>
              <TextField.Input
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#999"
                secureTextEntry
                className="font-mono text-sm h-10"
                style={{ fontFamily: 'Menlo' }}
              />
            </TextField>
          </View>
        </View>

        <Button
          onPress={handleLogin}
          isDisabled={isLoading}
          className="mt-2 bg-black rounded-none shadow-[4px_4px_0px_#FF5800] h-12"
        >
          {isLoading ? (
            <Spinner size="sm" color="white" />
          ) : (
            <MachineText className="text-white font-bold">INITIATE_HANDSHAKE</MachineText>
          )}
        </Button>
      </View>
    </View>
  );
}
