import React from "react";
import { Text, TextProps } from "react-native";
import { tv } from "tailwind-variants";

const textStyles = tv({
    base: "text-foreground font-medium",
    variants: {
        variant: {
            h1: "text-4xl font-bold tracking-tight mb-2",
            h2: "text-2xl font-semibold mb-2",
            h3: "text-xl font-semibold mb-1",
            body: "text-base leading-6 text-foreground/90",
            caption: "text-sm text-foreground/60",
            label: "text-xs uppercase tracking-wider text-foreground/50",
        },
        emphasis: {
            low: "opacity-60",
            normal: "opacity-100",
            high: "font-bold",
        },
    },
    defaultVariants: {
        variant: "body",
        emphasis: "normal",
    },
});

interface TypographyProps extends TextProps {
    variant?: "h1" | "h2" | "h3" | "body" | "caption" | "label";
    emphasis?: "low" | "normal" | "high";
    className?: string;
    children?: React.ReactNode;
}

export function Typography({
    children,
    variant,
    emphasis,
    className,
    ...props
}: TypographyProps) {
    return (
        <Text className={textStyles({ variant, emphasis, className })} {...props}>
            {children}
        </Text>
    );
}

export const H1 = (props: TypographyProps) => <Typography variant="h1" {...props} />;
export const H2 = (props: TypographyProps) => <Typography variant="h2" {...props} />;
export const H3 = (props: TypographyProps) => <Typography variant="h3" {...props} />;
export const Body = (props: TypographyProps) => <Typography variant="body" {...props} />;
export const Caption = (props: TypographyProps) => <Typography variant="caption" {...props} />;
export const Label = (props: TypographyProps) => <Typography variant="label" {...props} />;
