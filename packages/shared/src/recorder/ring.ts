/**
 * Fixed-capacity buffer that drops the oldest entry on overflow and keeps a
 * running drop count. Readers surface `dropped` so an agent can tell a
 * truncated window from an empty one.
 */
export class Ring<T> {
  private items: T[] = [];
  private droppedCount = 0;

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error("Ring capacity must be >= 1");
  }

  push(item: T): void {
    this.items.push(item);
    while (this.items.length > this.capacity) {
      this.items.shift();
      this.droppedCount += 1;
    }
  }

  get dropped(): number {
    return this.droppedCount;
  }

  toArray(): T[] {
    return this.items.slice();
  }

  /** Empties the buffer. The drop counter is cumulative and survives. */
  clear(): void {
    this.items = [];
  }
}
