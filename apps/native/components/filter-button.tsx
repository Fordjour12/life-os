import React from "react";
import { Button } from "heroui-native";
import { MachineText } from "@/components/ui/machine-text";

type FilterButtonProps = {
  label: string;
  isSelected: boolean;
  onPress: () => void;
};

export const FilterButton = React.memo(function FilterButton({
  label,
  isSelected,
  onPress,
}: FilterButtonProps) {
  return (
    <Button
      size="sm"
      onPress={onPress}
      className={`border-2 rounded-none ${
        isSelected
          ? "bg-foreground border-foreground"
          : "bg-surface border-divider shadow-[2px_2px_0px_var(--color-foreground)]"
      }`}
    >
      <MachineText
        className={`${isSelected ? "text-background" : "text-foreground"} font-bold text-[10px]`}
      >
        {label}
      </MachineText>
    </Button>
  );
});
