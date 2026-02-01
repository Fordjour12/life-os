import { Button, Spinner } from "heroui-native";
import { Pressable, View } from "react-native";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { MachineText } from "@/components/ui/machine-text";
import { formatTime } from "@/lib/calendar-utils";

type CalendarBlockKind = "busy" | "focus" | "rest" | "personal";

type CalendarBlock = {
  _id: Id<"calendarBlocks">;
  startMin: number;
  endMin: number;
  kind: CalendarBlockKind;
  title?: string;
  notes?: string;
};

type Props = {
  block: CalendarBlock;
  expandedBlockId: Id<"calendarBlocks"> | null;
  onToggleNotes: (blockId: Id<"calendarBlocks">) => void;
  onEdit: (blockId: Id<"calendarBlocks">) => void;
  onDuplicate: (block: CalendarBlock) => void;
  onDuplicateTomorrow: (block: CalendarBlock) => void;
  onRemove: (block: CalendarBlock) => void;
  isRemoving: boolean;
  showEdit?: boolean;
};

const kindStyles: Record<CalendarBlockKind, { label: string; badge: string }> = {
  busy: { label: "BUSY", badge: "bg-accent" },
  focus: { label: "FOCUS", badge: "bg-warning" },
  rest: { label: "REST", badge: "bg-success" },
  personal: { label: "PERSONAL", badge: "bg-foreground" },
};

export const CalendarBlockCard = React.memo(function CalendarBlockCard({
  block,
  expandedBlockId,
  onToggleNotes,
  onEdit,
  onDuplicate,
  onDuplicateTomorrow,
  onRemove,
  isRemoving,
  showEdit = false,
}: Props) {
  const isExpanded = expandedBlockId === block._id;
  const isRemovingThis = isRemoving;

  return (
    <View
      key={block._id}
      className="flex-row items-start justify-between border border-divider bg-surface px-3 py-2"
    >
      <View className={`w-1 self-stretch ${kindStyles[block.kind].badge}`} />
      <Pressable className="flex-1 ml-3 mr-2" onPress={() => onToggleNotes(block._id)}>
        <MachineText className="font-bold text-sm">
          {formatTime(block.startMin)} - {formatTime(block.endMin)}
        </MachineText>
        <MachineText className="text-xs text-foreground/60">
          {block.title ? block.title : "Untitled block"}
        </MachineText>
        {block.notes ? (
          isExpanded ? (
            <MachineText className="text-[10px] text-foreground/50 mt-1">
              NOTES: {block.notes}
            </MachineText>
          ) : (
            <MachineText className="text-[9px] text-foreground/40 mt-1">
              TAP_TO_VIEW_NOTES
            </MachineText>
          )
        ) : null}
      </Pressable>
      <View className="items-end gap-2">
        <View className="flex-row items-center gap-2">
          <View className={`w-2 h-2 ${kindStyles[block.kind].badge}`} />
          <MachineText variant="label">{kindStyles[block.kind].label}</MachineText>
          {block.kind === "busy" ? (
            <MachineText className="text-[9px] text-foreground/60">COUNTS_FREE</MachineText>
          ) : null}
        </View>
        <View className="flex-row flex-wrap justify-end gap-2">
          {showEdit && (
            <Button
              size="sm"
              className="bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)] px-2"
              onPress={() => onEdit(block._id)}
            >
              <MachineText className="text-[10px] font-bold text-foreground">EDIT</MachineText>
            </Button>
          )}
          <Button
            size="sm"
            className="bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)] px-2"
            onPress={() => onDuplicate(block)}
            isDisabled={isRemovingThis}
          >
            {isRemovingThis ? (
              <Spinner size="sm" color="black" />
            ) : (
              <MachineText className="text-[9px] font-bold text-foreground">DUPLICATE</MachineText>
            )}
          </Button>
          <Button
            size="sm"
            className="bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)] px-2"
            onPress={() => onDuplicateTomorrow(block)}
            isDisabled={isRemovingThis}
          >
            {isRemovingThis ? (
              <Spinner size="sm" color="black" />
            ) : (
              <MachineText className="text-[9px] font-bold text-foreground">TOMORROW</MachineText>
            )}
          </Button>
          <Button
            size="sm"
            className="bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)] px-2"
            onPress={() => onRemove(block)}
            isDisabled={isRemovingThis}
          >
            {isRemovingThis ? (
              <Spinner size="sm" color="black" />
            ) : (
              <MachineText className="text-[9px] font-bold text-foreground">REMOVE</MachineText>
            )}
          </Button>
        </View>
      </View>
    </View>
  );
});

import React from "react";
