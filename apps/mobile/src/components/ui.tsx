import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { base, colors } from "../theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 20,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Button({
  children,
  onPress,
  disabled,
  busy,
  variant = "primary",
  icon,
  small = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: IconName;
  small?: boolean;
}) {
  const foreground =
    variant === "primary" ? "#fff" : variant === "danger" ? colors.red : colors.green;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.smallButton,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : icon ? (
        <Icon name={icon} color={foreground} size={small ? 16 : 18} />
      ) : null}
      <Text style={[styles.buttonText, { color: foreground }, small && { fontSize: 13 }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  disabled,
  color,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, (disabled || pressed) && { opacity: 0.4 }]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#9CA697"
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 90, textAlignVertical: "top" },
          props.style,
        ]}
      />
      {hint ? <Text style={base.small}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  children,
  selected,
  onPress,
  icon,
  disabled,
}: {
  children: ReactNode;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.4 }]}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? colors.green : colors.muted} /> : null}
      <Text style={[styles.chipText, selected && { color: colors.green, fontWeight: "600" }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function SectionLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <View style={[base.between, { marginTop: 26, marginBottom: 12 }]}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {trailing}
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  icon,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  icon?: IconName;
}) {
  return (
    <View style={styles.switchRow}>
      {icon ? (
        <View style={{ marginRight: 12 }}>
          <Icon name={icon} color={colors.green} />
        </View>
      ) : null}
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={base.small}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.green }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function Empty({
  icon = "checkmark-done-outline",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.green} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={[base.subtitle, { textAlign: "center", maxWidth: 280 }]}>{children}</Text>
      {action ? <View style={{ marginTop: 20 }}>{action}</View> : null}
    </View>
  );
}

export function Notice({
  children,
  error = false,
  onClose,
}: {
  children: ReactNode;
  error?: boolean;
  onClose?: () => void;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, error && { backgroundColor: colors.redLight }]}
    >
      <Icon
        name={error ? "alert-circle-outline" : "information-circle-outline"}
        size={18}
        color={error ? colors.red : colors.green}
      />
      <Text style={[styles.noticeText, error && { color: colors.red }]}>{children}</Text>
      {onClose ? <IconButton name="close" label="Meldung schließen" onPress={onClose} /> : null}
    </View>
  );
}

export function Loading({ text = "Wird geladen …" }: { text?: string }) {
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={colors.green} />
      <Text style={base.small}>{text}</Text>
    </View>
  );
}

export function Sheet({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable
          accessibilityLabel="Dialog schließen"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: "93%" }]}
        >
          <View style={styles.handle} />
          <View style={[base.between, { paddingHorizontal: 22, paddingBottom: 12 }]}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <IconButton name="close" label="Schließen" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 18 }}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 19,
    paddingVertical: 12,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  smallButton: { minHeight: 37, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  primary: { backgroundColor: colors.green },
  secondary: { backgroundColor: colors.greenLight },
  danger: { backgroundColor: colors.redLight },
  buttonText: { fontSize: 15, fontWeight: "600" },
  iconButton: { minWidth: 38, minHeight: 38, alignItems: "center", justifyContent: "center" },
  field: { gap: 7, marginBottom: 18 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink, lineHeight: 21 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: "#FAFBF7",
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: "#F0F2EB",
  },
  chipSelected: { backgroundColor: colors.greenLight },
  chipText: { fontSize: 13, color: colors.muted },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.7,
    textTransform: "uppercase",
    color: colors.muted,
  },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13 },
  empty: { paddingVertical: 48, paddingHorizontal: 18, alignItems: "center" },
  emptyIcon: {
    height: 68,
    width: 68,
    borderRadius: 24,
    backgroundColor: colors.greenLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: "600", textAlign: "center" },
  notice: {
    marginVertical: 8,
    backgroundColor: colors.greenLight,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noticeText: { fontSize: 13, lineHeight: 19, color: colors.green, flex: 1 },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#15231966" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    paddingTop: 10,
  },
  handle: {
    height: 4,
    width: 38,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 21, fontWeight: "700", letterSpacing: -0.4, color: colors.ink },
  sheetFooter: {
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
