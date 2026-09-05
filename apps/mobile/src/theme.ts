import { StyleSheet } from "react-native";

export const colors = {
  background: "#F5F6F0",
  paper: "#FFFFFF",
  ink: "#21372C",
  muted: "#7D887D",
  green: "#2B503E",
  greenLight: "#E8EEDC",
  lime: "#D5E69D",
  line: "#E4E8DE",
  red: "#A64A3F",
  redLight: "#F8EBE5",
  amber: "#A3732D",
  blue: "#456F87",
};
export const areaColors = { me: "#77955A", agency: "#B99057", work: "#6388A0" };

export const base = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 110 },
  row: { flexDirection: "row", alignItems: "center" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: {
    fontSize: 32,
    lineHeight: 39,
    fontWeight: "700",
    letterSpacing: -1.3,
    color: colors.ink,
  },
  subtitle: { fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 6 },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontSize: 12, lineHeight: 18, color: colors.muted },
  card: {
    backgroundColor: colors.paper,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
  },
});
