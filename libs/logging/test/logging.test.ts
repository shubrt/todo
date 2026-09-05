import { describe, expect, it, vi } from "vite-plus/test";
import { logEvent } from "../src/index";

describe("diagnostic metadata", () => {
  it("omits request bodies, titles, and credentials from runtime objects", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => {});
    const event = {
      service: "todo-convex" as const,
      operation: "tasks.create",
      outcome: "ok" as const,
      requestId: "request-123",
      token: "private-token",
      title: "personal task",
      body: { authorization: "secret" },
    };
    logEvent(event);
    expect(JSON.parse(output.mock.calls[0]?.[0] as string)).toEqual({
      service: "todo-convex",
      operation: "tasks.create",
      outcome: "ok",
      requestId: "request-123",
    });
    output.mockRestore();
  });
});
