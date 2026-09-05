import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import { type Area } from "@todo/contracts";
import { Button, Chip, Empty, Icon, IconButton, Loading, SectionLabel } from "../components/ui";
import { DateField } from "../components/date-field";
import { areas, formatDay, shiftDate, type Completion } from "../lib/model";
import { areaColors, base, colors } from "../theme";

export function HistoryScreen({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [area, setArea] = useState<Area | undefined>();
  const [chooseDate, setChooseDate] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [previous, setPrevious] = useState<Completion[]>([]);
  const page = useQuery(api.completions.list, { from: date, to: date, area, limit: 50, cursor });
  const items = [...previous, ...(page?.items ?? [])];
  function changeDate(value: string) {
    setDate(value);
    setCursor(undefined);
    setPrevious([]);
  }
  return (
    <View>
      <View
        style={[
          base.between,
          {
            marginTop: 23,
            marginBottom: 17,
            padding: 9,
            borderRadius: 14,
            backgroundColor: colors.paper,
            borderWidth: 1,
            borderColor: colors.line,
          },
        ]}
      >
        <IconButton
          name="chevron-back"
          label="Vorheriger Tag"
          onPress={() => changeDate(shiftDate(date, -1))}
        />
        <Button
          small
          variant="ghost"
          icon="calendar-outline"
          onPress={() => setChooseDate(!chooseDate)}
        >
          {formatDay(date, today)}
        </Button>
        <IconButton
          name="chevron-forward"
          label="Nächster Tag"
          disabled={date >= today}
          onPress={() => changeDate(shiftDate(date, 1))}
        />
      </View>
      {chooseDate ? (
        <DateField
          label="Tag im Rückblick"
          value={date}
          onChange={(value) => {
            if (value) changeDate(value);
          }}
        />
      ) : null}
      <View style={[base.row, { gap: 7, marginBottom: 6 }]}>
        <Chip
          selected={!area}
          onPress={() => {
            setArea(undefined);
            setCursor(undefined);
            setPrevious([]);
          }}
        >
          Alle
        </Chip>
        {areas.map((entry) => (
          <Chip
            key={entry}
            selected={area === entry}
            onPress={() => {
              setArea(entry);
              setCursor(undefined);
              setPrevious([]);
            }}
          >
            {entry}
          </Chip>
        ))}
      </View>
      <SectionLabel>
        {items.length}
        {page?.nextCursor ? "+" : ""} erledigte Schritte
      </SectionLabel>
      {!page && !previous.length ? (
        <Loading />
      ) : !items.length ? (
        <Empty icon="time-outline" title="Noch ein unbeschriebenes Blatt.">
          Erledigte Aufgaben und Habits erscheinen hier mit ihrem damaligen Kontext.
        </Empty>
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((item) => (
            <View
              key={item._id}
              style={[base.card, { flexDirection: "row", gap: 14, padding: 16 }]}
            >
              <View
                style={{
                  height: 29,
                  width: 29,
                  borderRadius: 10,
                  backgroundColor: colors.greenLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={item.kind === "habit" ? "leaf-outline" : "checkmark"}
                  size={16}
                  color={colors.green}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={base.body}>{item.titleSnapshot}</Text>
                {item.parentTitleSnapshot ? (
                  <Text style={[base.small, { marginTop: 4 }]}>↳ {item.parentTitleSnapshot}</Text>
                ) : null}
                <View style={[base.row, { gap: 6, marginTop: 6, flexWrap: "wrap" }]}>
                  {item.areaSnapshot ? (
                    <>
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: areaColors[item.areaSnapshot],
                        }}
                      />
                      <Text style={base.small}>{item.areaSnapshot}</Text>
                    </>
                  ) : (
                    <Text style={base.small}>Habit</Text>
                  )}
                  {item.projectNameSnapshot ? (
                    <Text style={base.small}>· {item.projectNameSnapshot}</Text>
                  ) : null}
                  <Text style={base.small}>
                    ·{" "}
                    {new Intl.DateTimeFormat("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: item.timeZoneSnapshot,
                    }).format(item.completedAt)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
      {page?.nextCursor ? (
        <View style={{ marginTop: 18 }}>
          <Button
            variant="secondary"
            onPress={() => {
              setPrevious(items);
              setCursor(page.nextCursor!);
            }}
          >
            Weitere Erledigungen
          </Button>
        </View>
      ) : !page && previous.length ? (
        <Loading />
      ) : null}
      <Text style={[base.small, { textAlign: "center", marginTop: 25 }]}>
        Was du erledigt hast, bleibt. Auch nach dem Aufräumen.
      </Text>
    </View>
  );
}
