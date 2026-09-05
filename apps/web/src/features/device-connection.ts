import type { Connection } from "@todo/contracts";

export function deviceConnectionJson(cloudUrl: string | undefined, apiKey: string): string | null {
  if (!cloudUrl) return null;
  try {
    const url = new URL(cloudUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.cloud$/.test(url.hostname)
    )
      return null;
    const connection: Connection = { siteUrl: url.origin.replace(/\.cloud$/, ".site"), apiKey };
    return JSON.stringify({ version: 1, ...connection }, null, 2);
  } catch {
    return null;
  }
}
