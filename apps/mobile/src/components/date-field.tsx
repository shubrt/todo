import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { base, colors } from "../theme";
import { Button, Icon, IconButton } from "./ui";

export function DateField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return (
    <View style={{ gap: 7, marginBottom: 16 }}>
      <Text style={[base.body, { fontWeight: "600", fontSize: 14 }]}>{label}</Text>
      <View
        style={[
          base.row,
          {
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: "#FAFBF7",
            borderRadius: 12,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value || "Kein Datum"}`}
          onPress={() => setOpen(!open)}
          style={{
            minHeight: 49,
            padding: 13,
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
          }}
        >
          <Icon name="calendar-outline" size={17} color={colors.muted} />
          <Text style={[base.body, !value && { color: colors.muted }]}>
            {value
              ? new Intl.DateTimeFormat("de-DE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(date)
              : "Datum auswählen"}
          </Text>
        </Pressable>
        {value ? (
          <IconButton
            name="close-circle-outline"
            label={`${label} entfernen`}
            onPress={() => onChange("")}
          />
        ) : null}
      </View>
      {hint ? <Text style={base.small}>{hint}</Text> : null}
      {open ? (
        <View>
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            accentColor={colors.green}
            textColor={colors.ink}
            themeVariant="light"
            onChange={(event, selected) => {
              if (Platform.OS === "android") setOpen(false);
              if (event.type === "set" && selected)
                onChange(
                  `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`,
                );
            }}
          />
          {Platform.OS === "ios" ? (
            <Button
              small
              variant="secondary"
              onPress={() => {
                onChange(
                  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                );
                setOpen(false);
              }}
            >
              Datum übernehmen
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function TimeField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  const date = new Date(value ?? Date.now() + 3600_000);
  return (
    <View style={{ gap: 9, marginBottom: 14 }}>
      <View style={[base.row, { gap: 8 }]}>
        <Button small variant="secondary" icon="calendar-outline" onPress={() => setMode("date")}>
          Tag wählen
        </Button>
        <Button small variant="secondary" icon="time-outline" onPress={() => setMode("time")}>
          Uhrzeit wählen
        </Button>
      </View>
      {mode ? (
        <View>
          <DateTimePicker
            value={date}
            mode={mode}
            minimumDate={mode === "date" ? new Date() : undefined}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            accentColor={colors.green}
            textColor={colors.ink}
            themeVariant="light"
            onChange={(event, selected) => {
              if (Platform.OS === "android") setMode(null);
              if (event.type === "set" && selected) onChange(selected.getTime());
            }}
          />
          {Platform.OS === "ios" ? (
            <Button
              small
              variant="secondary"
              onPress={() => {
                onChange(date.getTime());
                setMode(null);
              }}
            >
              Übernehmen
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
