import type { AppEvents } from '../types/ui';

type Handler<T> = (data: T) => void;

class TypedEventBus {
  private listeners: Map<string, Handler<unknown>[]> = new Map();

  on<K extends keyof AppEvents>(event: K, cb: Handler<AppEvents[K]>): () => void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(cb as Handler<unknown>);
    this.listeners.set(event, handlers);
    return () => {
      const hs = this.listeners.get(event) ?? [];
      this.listeners.set(event, hs.filter(h => h !== cb));
    };
  }

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    // Snapshot so an on() during this emit doesn't fire for the in-flight
    // event — matching unsubscribe-during-emit, which (via the filter copy
    // in on()'s disposer) also only takes effect from the next emit.
    const handlers = [...(this.listeners.get(event) ?? [])];
    // Isolate each listener — a throw from one (e.g. a UI render bug) must
    // not starve later subscribers of this same emit. Surface the error to
    // the console rather than swallow it silently.
    for (const h of handlers) {
      try {
        h(data as unknown);
      } catch (err) {
        console.error(`eventBus: listener for "${String(event)}" threw`, err);
      }
    }
  }
}

export const eventBus = new TypedEventBus();
