import { Component, type ReactNode } from "react";
import type { Platform } from "./platform";

/** Last resort for a render crash: reload, or sign out and reload. */
export class ErrorBoundary extends Component<
  { platform: Platform; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="app">
          <header className="tb">
            <span className="ttl">todo</span>
          </header>
          <div className="login">
            <p>Deine Aufgaben brauchen einen neuen Anlauf.</p>
            <small>
              Der gespeicherte Stand bleibt erhalten. Die Verbindung kann abgelaufen sein.
            </small>
            <button className="act" onClick={() => window.location.reload()}>
              {this.props.platform.kind === "mac" ? "Fenster neu laden" : "Seite neu laden"}
            </button>
            <button
              className="link"
              onClick={() => {
                void this.props.platform.disconnect().then(() => window.location.reload());
              }}
            >
              Abmelden und neu anmelden
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}
