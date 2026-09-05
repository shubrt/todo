import { useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import type { Area } from "@todo/contracts";
import { Text, View } from "react-native";
import { Button, Empty, Icon, Loading, SectionLabel } from "../components/ui";
import { TaskRows } from "../components/task-row";
import { type Task } from "../lib/model";
import { base, colors } from "../theme";

export function TasksScreen({
  view,
  area,
  list,
  today,
  onEdit,
  onCapture,
}: {
  view: "priority" | "area";
  area: Area;
  list: "active" | "backlog";
  today: string;
  onEdit: (task: Task) => void;
  onCapture: () => void;
}) {
  const tasks = useQuery(api.tasks.list, view === "priority" ? { view } : { view, area, list });
  const deferred = useQuery(api.tasks.deferred, view === "area" ? { area } : "skip");
  const open = tasks?.filter((task) => !task.parentId && task.state === "open").length ?? 0;
  const done = tasks?.filter((task) => !task.parentId && task.state === "done").length ?? 0;
  const visibleDeferred = deferred?.filter((task) => task.list === list) ?? [];
  if (!tasks) return <Loading />;
  return (
    <View>
      {view === "priority" && tasks.length ? (
        <View
          style={{
            padding: 20,
            marginTop: 23,
            backgroundColor: colors.greenLight,
            borderRadius: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 17,
          }}
        >
          <View style={{ padding: 11, backgroundColor: "#D9E4BC", borderRadius: 14 }}>
            <Icon name="sunny-outline" size={25} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[base.body, { fontWeight: "600" }]}>
              {open
                ? `${open} ${open === 1 ? "Aufgabe braucht" : "Aufgaben brauchen"} deinen Fokus.`
                : "Das Wichtigste ist geschafft."}
            </Text>
            <Text style={[base.small, { marginTop: 4 }]}>
              {done
                ? `${done} ${done === 1 ? "Schritt ist" : "Schritte sind"} heute schon erledigt.`
                : "Eins nach dem anderen. Du entscheidest, womit du beginnst."}
            </Text>
          </View>
        </View>
      ) : null}
      <SectionLabel
        trailing={
          <Text style={base.small}>
            {open} offen{done ? ` · ${done} erledigt` : ""}
          </Text>
        }
      >
        {view === "priority"
          ? "Bereichsübergreifend"
          : list === "active"
            ? "Als Nächstes"
            : "Für später"}
      </SectionLabel>
      {!tasks.length ? (
        <Empty
          icon={
            view === "priority"
              ? "sunny-outline"
              : list === "backlog"
                ? "albums-outline"
                : "checkmark-done-outline"
          }
          title={
            view === "priority"
              ? "Gerade ist nichts dringend."
              : list === "backlog"
                ? "Platz für spätere Ideen."
                : "Hier ist Raum für deinen Tag."
          }
          action={
            view !== "priority" ? (
              <Button variant="secondary" onPress={onCapture} icon="add">
                Gedanken festhalten
              </Button>
            ) : undefined
          }
        >
          {view === "priority"
            ? "Hohe Prioritäten und fällige Aufgaben aus me, agency und work findest du hier."
            : list === "backlog"
              ? "Verschiebe Aufgaben hierher, die du gerade nicht angehen möchtest."
              : "Halte fest, was du als Nächstes tun möchtest."}
        </Empty>
      ) : (
        <TaskRows
          tasks={tasks}
          today={today}
          onEdit={onEdit}
          showArea={view === "priority"}
          sortable={view === "area"}
        />
      )}
      {visibleDeferred.length ? (
        <>
          <SectionLabel>Zurückgestellt</SectionLabel>
          <TaskRows tasks={visibleDeferred} today={today} onEdit={onEdit} sortable={false} />
          <Text style={[base.small, { marginTop: 12 }]}>
            Diese Aufgaben erscheinen zum geplanten Zeitpunkt wieder oben.
          </Text>
        </>
      ) : null}
      {view === "area" && tasks.length > 1 ? (
        <Text style={[base.small, { textAlign: "center", marginTop: 23 }]}>
          Halte eine Aufgabe gedrückt, um ihre Reihenfolge zu ändern.
        </Text>
      ) : null}
    </View>
  );
}
