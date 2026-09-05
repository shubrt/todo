type Client = { close: () => Promise<void> };
const lifetimes = new WeakMap<Client, { users: number; revision: number }>();

/** Release after descendant auth cleanup; tolerate React's development effect replay. */
export function retainClient(client: Client): () => void {
  const lifetime = lifetimes.get(client) ?? { users: 0, revision: 0 };
  lifetimes.set(client, lifetime);
  lifetime.users++;
  lifetime.revision++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lifetime.users--;
    const revision = ++lifetime.revision;
    queueMicrotask(() => {
      if (lifetime.users === 0 && lifetime.revision === revision) void client.close();
    });
  };
}
