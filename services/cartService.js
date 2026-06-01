/**
 * CartService - Manages active cart state, items lists, and pricing totals.
 * Fully integrated with Supabase shared_carts table to support realtime multi-guest dining.
 */
class CartService {
  constructor() {
    this.cartData = {}; // Maps itemId -> quantity (aggregated for compatibility)
    this.sharedCartItems = []; // Raw records representing { guest_name, menu_item_id, quantity }
    this.comboSavings = 0; // Dynamic savings from AI combo upgrades
  }

  getGuestName() {
    return localStorage.getItem("gp_guest_name") || "Guest";
  }

  setGuestName(name) {
    if (name && name.trim() !== "") {
      localStorage.setItem("gp_guest_name", name.trim());
    }
  }

  getTableNumber() {
    return (window.App && window.App.tableNumber) ? window.App.tableNumber : "5";
  }

  getCartItems() {
    return this.cartData;
  }

  getSharedCartItems() {
    return this.sharedCartItems;
  }

  /**
   * Synchronizes shared cart database rows with internal cache
   */
  async syncSharedCart() {
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const tableNum = this.getTableNumber();
        const { data, error } = await window.supabaseClient
          .from("shared_carts")
          .select("*")
          .eq("table_number", tableNum);

        if (error) throw error;

        this.sharedCartItems = data || [];
        
        // Re-compile aggregated cartData for compatibility
        this.cartData = {};
        this.sharedCartItems.forEach((row) => {
          const id = row.menu_item_id;
          this.cartData[id] = (this.cartData[id] || 0) + row.quantity;
        });
      } catch (e) {
        console.error("Supabase shared cart sync error:", e);
      }
    }
  }

  async addToCart(itemId) {
    const tableNum = this.getTableNumber();
    const guestName = this.getGuestName();

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        // Check if item already added by this specific guest
        const { data, error } = await window.supabaseClient
          .from("shared_carts")
          .select("*")
          .eq("table_number", tableNum)
          .eq("guest_name", guestName)
          .eq("menu_item_id", itemId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          // Increment quantity
          const { error: updErr } = await window.supabaseClient
            .from("shared_carts")
            .update({ quantity: data.quantity + 1 })
            .eq("id", data.id);
          if (updErr) throw updErr;
        } else {
          // Insert new row
          const { error: insErr } = await window.supabaseClient
            .from("shared_carts")
            .insert([{
              table_number: tableNum,
              guest_name: guestName,
              menu_item_id: itemId,
              quantity: 1
            }]);
          if (insErr) throw insErr;
        }
        
        await this.syncSharedCart();
      } catch (e) {
        console.error("Supabase shared cart add error, falling back locally:", e);
        this.addToCartLocally(itemId);
      }
    } else {
      this.addToCartLocally(itemId);
    }
    this.onChange();
  }

  addToCartLocally(itemId) {
    if (this.cartData[itemId]) {
      this.cartData[itemId]++;
    } else {
      this.cartData[itemId] = 1;
    }
    // Mirror in sharedCartItems cache for local split-bill consistency
    const guestName = this.getGuestName();
    const existing = this.sharedCartItems.find(i => i.menu_item_id === itemId && i.guest_name === guestName);
    if (existing) {
      existing.quantity++;
    } else {
      this.sharedCartItems.push({
        guest_name: guestName,
        menu_item_id: itemId,
        quantity: 1
      });
    }
  }

  async removeFromCart(itemId) {
    const tableNum = this.getTableNumber();
    const guestName = this.getGuestName();

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("shared_carts")
          .select("*")
          .eq("table_number", tableNum)
          .eq("guest_name", guestName)
          .eq("menu_item_id", itemId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          if (data.quantity > 1) {
            const { error: updErr } = await window.supabaseClient
              .from("shared_carts")
              .update({ quantity: data.quantity - 1 })
              .eq("id", data.id);
            if (updErr) throw updErr;
          } else {
            const { error: delErr } = await window.supabaseClient
              .from("shared_carts")
              .delete()
              .eq("id", data.id);
            if (delErr) throw delErr;
          }
        }
        
        await this.syncSharedCart();
      } catch (e) {
        console.error("Supabase shared cart remove error, falling back locally:", e);
        this.removeFromCartLocally(itemId);
      }
    } else {
      this.removeFromCartLocally(itemId);
    }

    // Automatically reset combo savings if item count falls to zero
    if (this.getTotalCount() === 0) {
      this.comboSavings = 0;
    }
    this.onChange();
  }

  removeFromCartLocally(itemId) {
    if (this.cartData[itemId]) {
      this.cartData[itemId]--;
      if (this.cartData[itemId] <= 0) {
        delete this.cartData[itemId];
      }
    }
    const guestName = this.getGuestName();
    const existingIdx = this.sharedCartItems.findIndex(i => i.menu_item_id === itemId && i.guest_name === guestName);
    if (existingIdx !== -1) {
      this.sharedCartItems[existingIdx].quantity--;
      if (this.sharedCartItems[existingIdx].quantity <= 0) {
        this.sharedCartItems.splice(existingIdx, 1);
      }
    }
  }

  async clearCart() {
    const tableNum = this.getTableNumber();

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { error } = await window.supabaseClient
          .from("shared_carts")
          .delete()
          .eq("table_number", tableNum);
        if (error) throw error;
        
        this.cartData = {};
        this.sharedCartItems = [];
      } catch (e) {
        console.error("Supabase shared cart clear error, clearing locally:", e);
        this.cartData = {};
        this.sharedCartItems = [];
      }
    } else {
      this.cartData = {};
      this.sharedCartItems = [];
    }
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
