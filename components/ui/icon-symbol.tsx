// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Partial<Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>> & Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "shield.fill": "shield",
  "book.fill": "menu-book",
  "phone.fill": "phone",
  "person.fill": "person",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "plus.circle.fill": "add-circle",
  "trash.fill": "delete",
  "pencil": "edit",
  "xmark.circle.fill": "cancel",
  "bell.fill": "notifications",
  "gearshape.fill": "settings",
  "heart.fill": "favorite",
  "info.circle.fill": "info",
  "exclamationmark.triangle.fill": "warning",
  "checkmark.circle.fill": "check-circle",
  "applewatch": "watch",
  "bluetooth": "bluetooth",
  "heart.text.square": "monitor-heart",
  "pills.fill": "medication",
  "bell.badge.fill": "notifications-active",
  "moon.fill": "bedtime",
  "clock.fill": "access-time",
} satisfies Record<string, ComponentProps<typeof MaterialIcons>["name"]>;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
