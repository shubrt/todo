import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { parseConnection, type Connection } from "@todo/native-client";
import { Button, Field, Icon, Notice } from "../components/ui";
import { base, colors } from "../theme";

export function ConnectScreen({
  onConnect,
  initialError,
}: {
  onConnect: (connection: Connection) => Promise<void>;
  initialError?: string;
}) {
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connectionText, setConnectionText] = useState("");
  const [paste, setPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  async function connect() {
    setError("");
    setBusy(true);
    try {
      await onConnect(
        parseConnection(
          paste
            ? connectionText.trim()
            : JSON.stringify({ siteUrl: siteUrl.trim(), apiKey: apiKey.trim() }),
        ),
      );
    } catch {
      setError(
        "Die Verbindung konnte nicht hergestellt werden. Prüfe die Adresse, den Zugangsschlüssel und deine Internetverbindung.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={base.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.brand}>
            <Icon name="checkmark" color={colors.green} size={28} />
          </View>
          <Text style={styles.eyebrow}>DEIN TAG, DEIN TEMPO</Text>
          <Text style={styles.title}>Ein klarer Kopf.{"\n"}Alles an einem Ort.</Text>
          <Text style={styles.description}>
            Deine Aufgaben, täglichen Habits und erledigten Schritte. Verbinde Todo einmal mit
            deinem Konto.
          </Text>
          <View style={styles.instructions}>
            <Icon name="key-outline" color={colors.green} />
            <Text style={[base.small, { flex: 1, color: colors.green }]}>
              Erzeuge in der Web-App unter Einstellungen einen eigenen Zugangsschlüssel für dieses
              Gerät.
            </Text>
          </View>
          {error ? (
            <Notice error onClose={() => setError("")}>
              {error}
            </Notice>
          ) : null}
          {paste ? (
            <Field
              label="Verbindungsdaten"
              placeholder={'{"siteUrl":"https://…convex.site","apiKey":"todo_…"}'}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              value={connectionText}
              onChangeText={setConnectionText}
              secureTextEntry={false}
            />
          ) : (
            <>
              <Field
                label="Adresse"
                placeholder="https://dein-projekt.convex.site"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                value={siteUrl}
                onChangeText={setSiteUrl}
              />
              <Field
                label="Zugangsschlüssel"
                placeholder="todo_…"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="password"
                value={apiKey}
                onChangeText={setApiKey}
              />
            </>
          )}
          <Button
            onPress={() => void connect()}
            busy={busy}
            disabled={paste ? !connectionText.trim() : !siteUrl.trim() || !apiKey.trim()}
            icon="arrow-forward"
          >
            Mit meinen Aufgaben verbinden
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setPaste(!paste);
              setError("");
            }}
          >
            {paste
              ? "Adresse und Schlüssel einzeln eingeben"
              : "Verbindungs-JSON oder Link einfügen"}
          </Button>
          <View style={[base.row, { justifyContent: "center", gap: 6, marginTop: 16 }]}>
            <Icon name="lock-closed-outline" size={13} color={colors.muted} />
            <Text style={base.small}>Sicher auf diesem Gerät gespeichert.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 35,
    flexGrow: 1,
    justifyContent: "center",
  },
  brand: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: colors.lime,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 35,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 2.2,
    marginBottom: 13,
  },
  title: {
    fontSize: 35,
    fontWeight: "700",
    lineHeight: 42,
    color: colors.ink,
    letterSpacing: -1.4,
  },
  description: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 23,
    marginTop: 17,
    marginBottom: 27,
  },
  instructions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderRadius: 13,
    backgroundColor: colors.greenLight,
    marginBottom: 25,
  },
});
