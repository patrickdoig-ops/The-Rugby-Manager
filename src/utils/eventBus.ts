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
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(data as unknown);
  }
}

export const eventBus = new TypedEventBus();
