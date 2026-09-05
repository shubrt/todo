import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useState, type ReactNode } from "react";
import { SessionProvider, useSessionAuth } from "./auth";

export const backendConfigured = Boolean(import.meta.env.VITE_CONVEX_URL);

function BackendProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() =>
    backendConfigured ? new ConvexReactClient(import.meta.env.VITE_CONVEX_URL) : null,
  );
  if (!client) return children;
  return (
    <ConvexProviderWithAuth client={client} useAuth={useSessionAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <BackendProvider>{children}</BackendProvider>
    </SessionProvider>
  );
}
