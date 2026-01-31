import { View } from "react-native";
import { tv } from "tailwind-variants";
import { Typography } from "./typography";

const badgeStyles = tv({
  base: "px-2.5 py-1 rounded-full flex-row items-center gap-1.5",
  variants: {
    intent: {
      success: "bg-success/10 border border-success/20",
      warning: "bg-warning/10 border border-warning/20",
      danger: "bg-danger/10 border border-danger/20",
      default: "bg-foreground/5 border border-foreground/10",
    },
  },
  defaultVariants: {
    intent: "default",
  },
});

const dotStyles = tv({
  base: "w-1.5 h-1.5 rounded-full",
  variants: {
    intent: {
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-danger",
      default: "bg-foreground/40",
    },
  },
});

interface StatusBadgeProps {
  label: string;
  value: string;
  intent?: "success" | "warning" | "danger" | "default";
}

export function StatusBadge({ label, value, intent = "default" }: StatusBadgeProps) {
  return (
    <View className="items-start">
      <Typography variant="label" className="mb-1 opacity-60">
        {label}
      </Typography>
      <View className={badgeStyles({ intent })}>
        <View className={dotStyles({ intent })} />
        <Typography variant="caption" className="font-semibold" style={{ fontSize: 11 }}>
          {value.toUpperCase()}
        </Typography>
      </View>
    </View>
  );
}
