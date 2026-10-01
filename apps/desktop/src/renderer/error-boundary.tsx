import { Component, type ReactNode } from "react";

export class DesktopErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="note-window">
          <div className="connection-form">
            <h1>Deine Aufgaben brauchen einen neuen Anlauf.</h1>
            <p>Der gespeicherte Stand bleibt erhalten. Die Verbindung kann abgelaufen sein.</p>
            <button className="button primary" onClick={() => window.location.reload()}>
              Fenster neu laden
            </button>
            <button
              className="button secondary"
              onClick={() => {
                void window.desktop.disconnect().then(() => window.location.reload());
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
