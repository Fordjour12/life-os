import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { Button } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

function Modal() {
  const navigation = useNavigation();

  function handleClose() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace("/(tabs)/today");
  }

  return (
    <Container className="bg-foreground/40 justify-center items-center p-6">
      <HardCard
        label="SYS_MSG_001"
        className="w-full max-w-sm shadow-[8px_8px_0px_var(--color-foreground)] bg-surface"
      >
        <View className="items-center p-2 gap-3">
          <View className="w-12 h-12 border border-foreground items-center justify-center bg-surface shadow-[2px_2px_0px_var(--color-foreground)]">
            <Ionicons name="information" size={24} color="var(--color-foreground)" />
          </View>

          <View className="items-center">
            <MachineText variant="header" size="lg" className="mb-1">SYSTEM_NOTICE</MachineText>
            <MachineText className="text-center text-xs text-muted max-w-[200px]">
              MODAL INTERRUPT RECEIVED. PLEASE ACKNOWLEDGE TO CONTINUE.
            </MachineText>
          </View>

          <Button
            onPress={handleClose}
            className="w-full bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
            size="lg"
          >
            <MachineText className="text-accent-foreground font-bold">ACKNOWLEDGE</MachineText>
          </Button>
        </View>
      </HardCard>
    </Container>
  );
}

export default Modal;
