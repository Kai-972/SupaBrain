// The server's event stream (CLAUDE.md §6.4 /api/stream): every StreamEvent gets a sequence number and is kept in a
// bounded buffer so a reconnecting dashboard can replay with `?since=<seq>` (or Last-Event-ID).
import type { StreamEvent } from "@supabrain/shared";

export interface Sequenced { seq: number; event: StreamEvent }

export class EventBus {
  private seq = 0;
  private readonly buffer: Sequenced[] = [];
  private readonly subs = new Set<(e: Sequenced) => void>();

  constructor(private readonly capacity = 2000) {}

  emit(event: StreamEvent): Sequenced {
    const s = { seq: ++this.seq, event };
    this.buffer.push(s);
    if (this.buffer.length > this.capacity) this.buffer.shift();
    for (const fn of this.subs) {
      try { fn(s); } catch { /* one bad subscriber must not stop the others */ }
    }
    return s;
  }

  since(seq: number): Sequenced[] {
    return this.buffer.filter((x) => x.seq > seq);
  }

  head(): number {
    return this.seq;
  }

  subscribe(fn: (e: Sequenced) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
}
