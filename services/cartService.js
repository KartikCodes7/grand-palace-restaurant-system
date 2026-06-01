/**
 * CartService - Manages active cart state, items lists, and pricing totals.
 * Prepared for future Supabase client interface connection.
 */
class CartService {
  constructor() {
    this.cartData = {}; // Maps itemId -> quantity
    this.comboSavings = 0; // Dynamic savings from AI combo upgrades
  }

  getCartItems() {
    return this.cartData;
  }

  addToCart(itemId) {
    if (this.cartData[itemId]) {
      this.cartData[itemId]++;
    } else {
      this.cartData[itemId] = 1;
    }
    this.onChange();
  }

  removeFromCart(itemId) {
    if (this.cartData[itemId]) {
      this.cartData[itemId]--;
      if (this.cartData[itemId] <= 0) {
        delete this.cartData[itemId];
      }
    }
    // Automatically reset combo savings if item count falls to zero
    if (this.getTotalCount() === 0) {
      this.comboSavings = 0;
    }
    this.onChange();
  }

  updateQuantity(itemId, qty) {
    if (qty <= 0) {
      delete this.cartData[itemId];
    } else {
      this.cartData[itemId] = qty;
    }
    this.onChange();
  }

  clearCart() {
    this.cartData = {};
    this.comboSavings = 0;
    this.onChange();
  }

  getItemQuantity(itemId) {
    return this.cartData[itemId] || 0;
  }

  getTotalCount() {
    return Object.values(this.cartData).reduce((sum, q) => sum + q, 0);
  }

  async getCartSummary(menuItems) {
    const list = [];
    let subtotal = 0;
    
    Object.keys(this.cartData).forEach((id) => {
      const item = menuItems.find(m => m.id === id);
      if (item) {
        const qty = this.cartData[id];
        const itemTotal = item.price * qty;
        subtotal += itemTotal;
        list.push({
          item: item,
          quantity: qty,
          totalPrice: itemTotal
        });
      }
    });

    // Apply AI dynamic combo savings
    const appliedSavings = this.comboSavings;
    const discountedSubtotal = Math.max(0, subtotal - appliedSavings);

    const taxRate = 0.08; // 8% luxury sales tax
    const serviceChargeRate = 0.10; // 10% premium service charge
    
    const tax = discountedSubtotal * taxRate;
    const serviceCharge = discountedSubtotal * serviceChargeRate;
    const grandTotal = discountedSubtotal + tax + serviceCharge;

    return {
      itemsList: list,
      subtotal: subtotal,
      discountedSubtotal: discountedSubtotal,
      comboSavings: appliedSavings,
      tax: tax,
      serviceCharge: serviceCharge,
      grandTotal: grandTotal
    };
  }

  onChange() {
    if (window.onAppStateChanged) {
      window.onAppStateChanged();
    }
  }
}

window.cartService = new CartService();
