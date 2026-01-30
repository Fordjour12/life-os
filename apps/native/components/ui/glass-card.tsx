import { BlurView } from "expo-blur";
import { useColorScheme, View, ViewProps } from "react-native";
import { tv } from "tailwind-variants";

interface GlassCardProps extends ViewProps {
    intensity?: number;
    variant?: "default" | "highlight";
    className?: string;
}

const cardStyles = tv({
    base: "overflow-hidden rounded-3xl border border-divider/40",
    variants: {
        variant: {
            default: "bg-surface/80",
            highlight: "bg-accent/10 border-accent/20",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});

export function GlassCard({
    children,
    style,
    intensity = 50,
    variant,
    className,
    ...props
}: GlassCardProps) {
    const colorScheme = useColorScheme();
    const tint = colorScheme === "dark" ? "dark" : "light";

    return (
        <View className={cardStyles({ variant, className })} style={style} {...props}>
            <BlurView intensity={intensity} tint={tint} style={{ flex: 1 }}>
                <View className="p-5">
                    {children}
                </View>
            </BlurView>
        </View>
    );
}
