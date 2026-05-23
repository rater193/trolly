/**
 * Tiny pub-sub event bus.
 * State changes broadcast here; views subscribe to re-render.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    this.listeners.get(evt)?.delete(fn);
  }
  emit(evt, payload) {
    this.listeners.get(evt)?.forEach(fn => {
      try { fn(payload); } catch (e) { console.error(`[EventBus:${evt}]`, e); }
    });
    // Wildcard listeners on '*'
    this.listeners.get("*")?.forEach(fn => {
      try { fn(evt, payload); } catch (e) { console.error(e); }
    });
  }
}
