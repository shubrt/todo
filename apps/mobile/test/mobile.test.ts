import { describe, expect, it } from "vite-plus/test";
import {
  formatDay,
  localDate,
  orderedMove,
  readableError,
  shiftDate,
  snapshotIsNewer,
  validateDate,
} from "../src/lib/model";
import { RefreshQueue } from "../src/lib/refresh-queue";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}

describe("mobile refresh and logout coordination", () => {
  it("retains an update arriving during a slow fetch and serializes native publication", async () => {
    const started = deferred();
    const finishFetch = deferred();
    let backendVersion = 1;
    let calls = 0;
    const published: number[] = [];
    const queue = new RefreshQueue(async () => {
      const version = backendVersion;
      calls++;
      if (calls === 1) {
        started.resolve();
        await finishFetch.promise;
      }
      published.push(version);
      return true;
    });
    const first = queue.request();
    await started.promise;
    backendVersion = 2;
    const second = queue.request();
    expect(second).toBe(first);
    finishFetch.resolve();
    expect(await second).toBe(true);
    expect(published).toEqual([1, 2]);
  });

  it("invalidates a pending configure before fetching or publishing and drains it before clear", async () => {
    const configuring = deferred();
    const finishConfigure = deferred();
    const events: string[] = [];
    const queue = new RefreshQueue(async (isActive) => {
      events.push("configure");
      configuring.resolve();
      await finishConfigure.promise;
      if (!isActive()) return false;
      events.push("fetch", "publish");
      return true;
    });
    const refresh = queue.request();
    await configuring.promise;
    const logout = queue.stop().then(() => {
      events.push("clear");
    });
    expect(events).toEqual(["configure"]);
    expect(await queue.request()).toBe(false);
    finishConfigure.resolve();
    await logout;
    expect(await refresh).toBe(false);
    expect(events).toEqual(["configure", "clear"]);
  });

  it("waits for an already started native write before clearing credentials", async () => {
    const publishing = deferred();
    const finishPublish = deferred();
    const events: string[] = [];
    const queue = new RefreshQueue(async () => {
      publishing.resolve();
      await finishPublish.promise;
      events.push("publish");
      return true;
    });
    void queue.request();
    await publishing.promise;
    void queue.request();
    const stopped = queue.stop().then(() => {
      events.push("clear");
    });
    finishPublish.resolve();
    await stopped;
    expect(events).toEqual(["publish", "clear"]);
  });

  it("can retry a failed request without retaining its rejected promise", async () => {
    let attempts = 0;
    const queue = new RefreshQueue(async () => {
      if (++attempts === 1) throw new Error("network unavailable");
      return true;
    });
    await expect(queue.request()).rejects.toThrow("network unavailable");
    expect(await queue.request()).toBe(true);
    expect(attempts).toBe(2);
  });

  it("does not run work queued before an immediate logout", async () => {
    let calls = 0;
    const queue = new RefreshQueue(async () => {
      calls++;
      return true;
    });
    const refresh = queue.request();
    await queue.stop();
    expect(await refresh).toBe(false);
    expect(calls).toBe(0);
  });
});

describe("mobile task presentation rules", () => {
  it("moves siblings manually without crossing the completed/open boundary", () => {
    const tasks = [
      { _id: "done", state: "done" },
      { _id: "a", state: "open" },
      { _id: "b", state: "open" },
    ];
    expect(orderedMove(tasks, "a", -1)).toBeNull();
    expect(orderedMove(tasks, "a", 1)).toEqual(["done", "b", "a"]);
    expect(orderedMove(tasks, "done", -1)).toBeNull();
    expect(orderedMove(tasks, "missing", 1)).toBeNull();
    expect(tasks.map((task) => task._id)).toEqual(["done", "a", "b"]);
  });

  it("uses calendar days across DST, leap days and year boundaries", () => {
    expect(shiftDate("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftDate("2026-10-25", 1)).toBe("2026-10-26");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(formatDay("2027-01-01", "2026-12-31")).toBe("Morgen");
    expect(validateDate("2026-02-29")).toBe(false);
    expect(validateDate("2028-02-29")).toBe(true);
  });

  it("reads the owner's calendar date independently of the device zone", () => {
    const instant = Date.parse("2026-09-05T23:30:00Z");
    expect(localDate(instant, "Europe/Berlin")).toBe("2026-09-06");
    expect(localDate(instant, "America/Los_Angeles")).toBe("2026-09-05");
  });

  it("does not expose arbitrary transport errors or credentials", () => {
    const message = readableError(new Error("Request Authorization: Bearer todo_secret"));
    expect(message).not.toContain("todo_secret");
    expect(
      readableError({
        data: { code: "STALE_OCCURRENCE", message: "Dieser Habit gehört zu einem anderen Tag." },
      }),
    ).toBe("Dieser Habit gehört zu einem anderen Tag.");
    expect(readableError({ data: "{malformed" })).toBe(message);
  });

  it("rejects late snapshots even when their local date looks newer", () => {
    const previous = { generatedAt: 200, localDate: "2026-09-05" };
    expect(snapshotIsNewer({ generatedAt: 100, localDate: "2026-09-06" }, previous)).toBe(false);
    expect(snapshotIsNewer({ generatedAt: 201, localDate: "2026-09-04" }, previous)).toBe(true);
  });
});
