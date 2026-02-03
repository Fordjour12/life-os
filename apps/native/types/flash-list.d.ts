declare module "@shopify/flash-list" {
  import React from "react";
  import { View, ScrollViewProps, StyleProp, ViewStyle, RefObject } from "react-native";

  interface FlashListProps<T> extends ScrollViewProps {
    data: T[];
    renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
    keyExtractor: (item: T, index: number) => string;
    estimatedItemSize?: number;
    contentContainerStyle?: StyleProp<ViewStyle>;
    showsVerticalScrollIndicator?: boolean;
    extraData?: unknown;
    horizontal?: boolean;
    numColumns?: number;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    estimatedFirstItemOffset?: number;
    disableVirtualization?: boolean;
    drawDistance?: number;
  }

  type FlashListRef<T> = View;

  export function FlashList<T>(props: FlashListProps<T>): React.ReactElement;
}
