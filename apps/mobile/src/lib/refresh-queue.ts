/** Coalesces concurrent refreshes, retaining a refresh requested during a slow fetch. */
export class RefreshQueue {
  private running: Promise<boolean> | null = null;
  private requested = false;
  private stopped = false;

  constructor(private readonly work: (isActive: () => boolean) => Promise<boolean>) {}

  request(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    this.requested = true;
    if (!this.running) this.running = Promise.resolve().then(() => this.drain());
    return this.running;
  }

  private async drain(): Promise<boolean> {
    let successful = false;
    try {
      while (this.requested && !this.stopped) {
        this.requested = false;
        successful = await this.work(() => !this.stopped);
      }
      return !this.stopped && successful;
    } finally {
      this.running = null;
    }
  }

  /** Invalidates synchronously; resolves after all in-flight native writes have settled. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.requested = false;
    await this.running;
  }
}
