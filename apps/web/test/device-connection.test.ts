import { describe, expect, it } from "vite-plus/test";
import { deviceConnectionJson } from "../src/features/device-connection";

describe("Geräteverbindung aus der Web-Konfiguration", () => {
  it("verwendet dieselbe Convex-Umgebung für Gerätetokens", () => {
    expect(JSON.parse(deviceConnectionJson("https://my-todo.convex.cloud/", "todo_key")!)).toEqual({
      version: 1,
      siteUrl: "https://my-todo.convex.site",
      apiKey: "todo_key",
    });
  });

  it("erzeugt aus fehlenden oder fremden Backend-Adressen keine Geräteverbindung", () => {
    for (const url of [
      undefined,
      "http://my-todo.convex.cloud",
      "https://my-todo.convex.cloud.evil.test",
      "https://user:password@my-todo.convex.cloud",
      "https://my-todo.convex.cloud/api",
      "https://my-todo.convex.cloud?redirect=elsewhere",
      "not a url",
    ])
      expect(deviceConnectionJson(url, "todo_key")).toBeNull();
  });
});
