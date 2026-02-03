import { useThemeColor } from "heroui-native";

export function useSemanticColors() {
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  const surface = useThemeColor("surface");
  const overlay = useThemeColor("overlay");
  const muted = useThemeColor("muted");
  const accent = useThemeColor("accent");
  const success = useThemeColor("success");
  const warning = useThemeColor("warning");
  const danger = useThemeColor("danger");
  const border = useThemeColor("border");
  const divider = useThemeColor("divider");
  const link = useThemeColor("link");

  return {
    background,
    foreground,
    surface,
    overlay,
    muted,
    accent,
    primary: accent,
    secondary: foreground,
    success,
    warning,
    danger,
    error: danger,
    fieldBackground: surface,
    fieldForeground: foreground,
    fieldBorder: border,
    border,
    divider,
    link,
  };
}
