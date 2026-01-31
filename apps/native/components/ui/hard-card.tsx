import { View, ViewProps, Text } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

const cardStyles = tv({
  base: "border border-divider overflow-hidden bg-surface",
  variants: {
    variant: {
      default: "shadow-[2px_2px_0px_var(--color-foreground)]",
      flat: "border-divider shadow-none bg-muted",
      pressed: "translate-x-[2px] translate-y-[2px] shadow-none border-divider",
    },
    radius: {
      none: "rounded-none",
      sm: "rounded-sm", // 2px
      md: "rounded-md", // 4px
    },
    padding: {
      none: "p-0",
      sm: "p-3",
      md: "p-5",
    },
  },
  defaultVariants: {
    variant: "default",
    radius: "sm",
    padding: "md",
  },
});

type CardVariants = VariantProps<typeof cardStyles>;

interface HardCardProps extends ViewProps, CardVariants {
  label?: string; // Optional "Module Label" (e.g. "TASK-01")
  className?: string; // Explicitly keeping className in props for clarity
}

export function HardCard({
  children,
  style,
  variant,
  radius,
  padding,
  label,
  className,
  ...props
}: HardCardProps) {
  return (
    <View className={cardStyles({ variant, radius, padding, className })} style={style} {...props}>
      {label && (
        <View className="border-b border-divider px-2 py-1 bg-muted flex-row justify-between items-center">
          <Text className="text-[10px] font-mono uppercase text-muted tracking-widest">
            {label}
          </Text>
        </View>
      )}
      <View>{children}</View>
    </View>
  );
}
