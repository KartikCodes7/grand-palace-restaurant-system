/**
 * shared/events.js - Orchestrates real-time cross-tab synchronization.
 * Connects Guest and Owner windows through native HTML5 Storage Events.
 */
class GrandPalaceEvents {
  constructor() {
    this.menuCallbacks = [];
    this.ordersCallbacks = [];
    this.feedbacksCallbacks = [];

    this.setupListeners();
  }

  /**
   * Listen to storage updates from other tabs, and manual events from the same tab.
   */
  setupListeners() {
    // Cross-tab synchronization
    window.addEventListener("storage", (e) => {
      this.handleStorageEvent(e.key);
    });

    // Same-tab synchronization
    window.addEventListener("storage_manual_update", () => {
      this.triggerAll();
    });
  }

  handleStorageEvent(key) {
    if (!key) return;

    if (key === "gp_menu_catalog") {
      this.menuCallbacks.forEach(cb => cb());
    } else if (key === "gp_orders_list") {
      this.ordersCallbacks.forEach(cb => cb());
    } else if (key === "gp_feedbacks_list") {
      this.feedbacksCallbacks.forEach(cb => cb());
    }
  }

  triggerAll() {
    this.menuCallbacks.forEach(cb => cb());
    this.ordersCallbacks.forEach(cb => cb());
    this.feedbacksCallbacks.forEach(cb => cb());
  }

  /**
   * Registry subscription helpers
   */
  onMenuUpdated(cb) {
    if (typeof cb === "function") this.menuCallbacks.push(cb);
  }

  onOrdersUpdated(cb) {
    if (typeof cb === "function") this.ordersCallbacks.push(cb);
  }

  onFeedbacksUpdated(cb) {
    if (typeof cb === "function") this.feedbacksCallbacks.push(cb);
  }
}

window.gpEvents = new GrandPalaceEvents();
