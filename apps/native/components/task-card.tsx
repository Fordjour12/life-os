import { useMutation } from "convex/react";
import { Button } from "heroui-native";
import { View } from "react-native";
import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { MachineText } from "@/components/ui/machine-text";

type TaskItem = {
  _id: Id<"tasks">;
  title: string;
  estimateMin: number;
  status: string;
};

type Props = {
  task: TaskItem;
  index: number;
};

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export const TaskCard = React.memo(function TaskCard({ task, index }: Props) {
  const completeTaskMutation = useMutation(api.kernel.taskCommands.completeTask);

  const completeTask = async () => {
    await completeTaskMutation({ taskId: task._id, idempotencyKey: idem() });
  };

  return (
    <View className="bg-surface border border-divider">
      <View className="flex-row items-center justify-between p-3">
        <View className="flex-row items-center gap-3 flex-1">
          <MachineText variant="label" className="w-4 text-center text-foreground/30">
            {index + 1}
          </MachineText>
          <View>
            <MachineText className="font-bold text-base">{task.title}</MachineText>
            <MachineText className="text-xs opacity-50">{task.estimateMin} MIN</MachineText>
          </View>
        </View>
        <Button
          size="sm"
          onPress={completeTask}
          className="border border-divider bg-muted shadow-[2px_2px_0px_var(--color-foreground)]"
        >
          <MachineText className="text-[10px] font-bold text-foreground">DONE</MachineText>
        </Button>
      </View>
    </View>
  );
});

import React from "react";
