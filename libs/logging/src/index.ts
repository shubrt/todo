export type LogEvent = {
  service: "todo-convex";
  operation: string;
  outcome: "ok" | "error";
  requestId?: string;
  taskId?: string;
  durationMs?: number;
  errorCode?: string;
  period?: string;
};

/** Allowlisted scalar fields prevent bodies and credentials entering the log output. */
function eventFields(event: LogEvent): LogEvent {
  return {
    service: event.service,
    operation: event.operation,
    outcome: event.outcome,
    ...(event.requestId ? { requestId: event.requestId } : {}),
    ...(event.taskId ? { taskId: event.taskId } : {}),
    ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    ...(event.period ? { period: event.period } : {}),
  };
}

/** Structured console logging for Convex: no Node imports or network transports. */
export function logEvent(event: LogEvent): void {
  try {
    const message = JSON.stringify(eventFields(event));
    if (event.outcome === "error") console.error(message);
    else console.info(message);
  } catch {
    // Diagnostics must not affect the business transaction.
  }
}
