import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button } from "heroui-native";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSemanticColors } from "@/lib/theme";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { InboxSkeleton } from "@/components/skeletons/inbox-skeleton";
import { getTimezoneOffsetMinutes } from "@/lib/date";

type SuggestionItem = {
   _id: string;
   type: string;
   reason?: { detail?: string };
};

function idem() {
   return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Inbox() {
   const router = useRouter();
   const tzOffsetMinutes = getTimezoneOffsetMinutes();
   const data = useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
   const execute = useMutation(api.kernel.commands.executeCommand);

   const vote = async (suggestionId: string, voteValue: "up" | "down" | "ignore") => {
      await execute({
         command: {
            cmd: "submit_feedback",
            input: { suggestionId, vote: voteValue },
            idempotencyKey: idem(),
            tzOffsetMinutes,
         },
      });
   };

   if (!data) {
      return <InboxSkeleton />;
   }

   const suggestions = (data.suggestions ?? []) as SuggestionItem[];
   const colors = useSemanticColors();

   return (
      <Container className="pt-6">
         <View className="mb-6 border-b-2 border-divider pb-2 flex-row items-center justify-between">
            <View>
               <MachineText variant="header" size="2xl">
                  SUGGESTIONS
               </MachineText>
               <MachineText className="text-muted-foreground/40 text-xs mt-1 uppercase">
                  AI Recommendations
               </MachineText>
            </View>
            <Pressable
               onPress={() => router.push("/threads")}
               hitSlop={12}
               className="border border-divider bg-surface shadow-[2px_2px_0px_var(--color-foreground)] p-2 size-7 items-center justify-center"
               style={({ pressed }) =>
                  pressed ? { transform: [{ translateY: 2 }], boxShadow: "none" } : {}
               }
            >
               {({ pressed }) => (
                  <Ionicons name="chatbubbles-outline" size={20} color={colors.foreground} />
               )}
            </Pressable>
         </View>

         {suggestions.length ? (
            <View className="gap-4">
               {suggestions.map((suggestion) => (
                  <HardCard key={suggestion._id} label="SIGNAL_DETECTED" className="gap-3 p-4 bg-surface">
                     <View className="gap-1">
                        <MachineText className="font-bold text-lg">{suggestion.type}</MachineText>
                        <MachineText className="text-muted text-xs">
                           {suggestion.reason?.detail}
                        </MachineText>
                     </View>

                     <View className="flex-row gap-2 flex-wrap pt-2 border-t border-divider">
                        <Button
                           size="sm"
                           className="bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                           onPress={() => vote(suggestion._id, "up")}
                        >
                           <MachineText className="text-accent-foreground font-bold text-[10px]">
                              USEFUL
                           </MachineText>
                        </Button>
                        <Button
                           size="sm"
                           className="bg-surface border border-foreground rounded-none"
                           onPress={() => vote(suggestion._id, "down")}
                        >
                           <MachineText className="text-foreground font-bold text-[10px]">
                              NOT_USEFUL
                           </MachineText>
                        </Button>
                        <Button
                           size="sm"
                           className="bg-surface border border-foreground rounded-none opacity-50"
                           onPress={() => vote(suggestion._id, "ignore")}
                        >
                           <MachineText className="text-foreground font-bold text-[10px]">
                              IGNORE
                           </MachineText>
                        </Button>
                     </View>
                  </HardCard>
               ))}
            </View>
         ) : (
            <HardCard variant="flat" className="p-6 border-dashed items-center justify-center">
               <MachineText className="text-muted">NO_SIGNALS_DETECTED</MachineText>
            </HardCard>
         )}
      </Container>
   );
}
