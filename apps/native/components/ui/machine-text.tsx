import { Text, TextProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

const textStyles = tv({
    base: "font-mono text-foreground",
    variants: {
        variant: {
            default: "font-normal",
            header: "font-bold uppercase tracking-widest", // H1 style
            label: "text-[10px] uppercase tracking-widest text-foreground/70", // Tiny label
            value: "font-bold text-primary", // For displaying data values
        },
        size: {
            xs: "text-[10px]",
            sm: "text-xs",
            md: "text-base",
            lg: "text-lg",
            xl: "text-2xl",
            "2xl": "text-4xl",
        }
    },
    defaultVariants: {
        variant: "default",
        size: "md",
    },
});

type TextVariants = VariantProps<typeof textStyles>;

interface MachineTextProps extends TextProps, TextVariants {
    className?: string;
}

export function MachineText({
    children,
    style,
    variant,
    size,
    className,
    ...props
}: MachineTextProps) {
    return (
        <Text
            className={textStyles({ variant, size, className })}
            style={style}
            {...props}
        >
            {children}
        </Text>
    );
}
