import { createLogger, initLogger } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { eventFields, type LogEvent } from "./index";

let initialized = false;

export function logServerEvent(event: Omit<LogEvent, "service">): void {
  try {
    if (!initialized) {
      const dataset = process.env.AXIOM_DATASET;
      const apiKey = process.env.AXIOM_TOKEN;
      initLogger({
        env: { service: "todo-web" },
        pretty: false,
        stringify: true,
        redact: {
          paths: ["**.authorization", "**.cookie", "**.token", "**.body", "**.title"],
          builtins: ["jwt", "bearer"],
        },
        ...(dataset && apiKey ? { drain: createAxiomDrain({ dataset, apiKey }) } : {}),
      });
      initialized = true;
    }
    createLogger({ ...eventFields({ ...event, service: "todo-web" }) }).emit();
  } catch {
    // Authentication and API responses must survive a failed logging transport.
  }
}
