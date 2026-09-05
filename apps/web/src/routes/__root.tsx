import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AppProviders } from "../providers";
import stylesheet from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "todo · Platz für das Wesentliche" },
      {
        name: "description",
        content: "Deine Aufgaben. Drei Bereiche, ein klarer nächster Schritt.",
      },
      { name: "theme-color", content: "#f6f6f2" },
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  component: Root,
  notFoundComponent: () => (
    <main className="standalone">
      <h1>Hier ist nichts.</h1>
      <a className="button primary" href="/">
        Zu deinen Aufgaben
      </a>
    </main>
  ),
  errorComponent: () => (
    <main className="standalone">
      <h1>Die Ansicht konnte nicht geladen werden.</h1>
      <p>Deine gespeicherten Aufgaben bleiben erhalten.</p>
      <button className="button primary" onClick={() => window.location.reload()}>
        Erneut laden
      </button>
    </main>
  ),
});

function Root() {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProviders>
          <Outlet />
        </AppProviders>
        <Scripts />
      </body>
    </html>
  );
}
