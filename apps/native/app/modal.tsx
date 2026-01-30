import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Button } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

function Modal() {
  function handleClose() {
    router.back();
  }

  return (
    <Container className="bg-black/50 justify-center items-center p-6">
      <HardCard label="SYS_MSG_001" className="w-full max-w-sm shadow-[8px_8px_0px_black] bg-[#EBEBE8]">
        <View className="items-center p-2 gap-3">
          <View className="w-12 h-12 border border-black items-center justify-center bg-white shadow-[2px_2px_0px_black]">
            <Ionicons name="information" size={24} color="black" />
          </View>

          <View className="items-center">
            <MachineText variant="header" size="lg" className="mb-1">SYSTEM_NOTICE</MachineText>
            <MachineText className="text-center text-xs text-muted max-w-[200px]">
              MODAL INTERRUPT RECEIVED. PLEASE ACKNOWLEDGE TO CONTINUE.
            </MachineText>
          </View>

          <Button
            onPress={handleClose}
            className="w-full bg-primary rounded-none shadow-[2px_2px_0px_black]"
            size="lg"
          >
            <MachineText className="text-white font-bold">ACKNOWLEDGE</MachineText>
          </Button>
        </View>
      </HardCard>
    </Container>
  );
}

export default Modal;
