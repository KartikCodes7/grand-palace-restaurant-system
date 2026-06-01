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

  async setGuestName(name) {
    if (name && name.trim() !== "") {
      localStorage.setItem("gp_guest_name", name.trim());
      await this.joinTableSession(name);
    }
  }

  async joinTableSession(name) {
    const tableNum = this.getTableNumber();
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        // Clear any previous identical guest row on this table to prevent duplicates
        await window.supabaseClient
          .from("table_sessions")
          .delete()
          .eq("table_number", tableNum)
          .eq("guest_name", name.trim());

        const { error } = await window.supabaseClient
          .from("table_sessions")
          .insert([{
            table_number: tableNum,
            guest_name: name.trim()
          }]);
        if (error) throw error;
      } catch (e) {
        console.error("Supabase table session join error, utilizing local fallback:", e);
        this.joinTableSessionLocally(name);
      }
    } else {
      this.joinTableSessionLocally(name);
    }
  }

  joinTableSessionLocally(name) {
    const tableNum = this.getTableNumber();
    const sessions = window.gpStorage.getTableSessions();
    const filtered = sessions.filter(s => !(s.table_number === tableNum && s.guest_name === name.trim()));
    filtered.push({
      table_number: tableNum,
      guest_name: name.trim(),
      joined_at: new Date().toISOString()
    });
    window.gpStorage.saveTableSessions(filtered);
  }

  async clearTableSessions(tableNum) {
    const targetTable = tableNum || this.getTableNumber();
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { error } = await window.supabaseClient
          .from("table_sessions")
          .delete()
          .eq("table_number", targetTable);
        if (error) throw error;
      } catch (e) {
        console.error("Supabase table sessions clear error, utilizing local fallback:", e);
        this.clearTableSessionsLocally(targetTable);
      }
    } else {
      this.clearTableSessionsLocally(targetTable);
    }
  }

  clearTableSessionsLocally(tableNum) {
    const sessions = window.gpStorage.getTableSessions();
    const filtered = sessions.filter(s => s.table_number !== tableNum);
    window.gpStorage.saveTableSessions(filtered);
  }

  async getTableSessions() {
    const tableNum = this.getTableNumber();
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("table_sessions")
          .select("*")
          .eq("table_number", tableNum);
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error("Supabase table sessions query error:", e);
        return this.getTableSessionsLocally();
      }
    } else {
      return this.getTableSessionsLocally();
    }
  }

  getTableSessionsLocally() {
    const tableNum = this.getTableNumber();
    const sessions = window.gpStorage.getTableSessions();
    return sessions.filter(s => s.table_number === tableNum);
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
        console.error("Supabase shared cart sync error, utilizing local storage:", e);
        this.syncSharedCartLocally();
      }
    } else {
      this.syncSharedCartLocally();
    }
  }

  syncSharedCartLocally() {
    const tableNum = this.getTableNumber();
    const allCarts = window.gpStorage.getSharedCarts();
    this.sharedCartItems = allCarts.filter(c => c.table_number === tableNum);
    this.cartData = {};
    this.sharedCartItems.forEach((row) => {
      const id = row.menu_item_id;
      this.cartData[id] = (this.cartData[id] || 0) + row.quantity;
    });
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
    const guestName = this.getGuestName();
    const tableNum = this.getTableNumber();
    
    const allCarts = window.gpStorage.getSharedCarts();
    const existing = allCarts.find(i => i.table_number === tableNum && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existing) {
      existing.quantity++;
    } else {
      allCarts.push({
        table_number: tableNum,
        guest_name: guestName,
        menu_item_id: itemId,
        quantity: 1
      });
    }
    window.gpStorage.saveSharedCarts(allCarts);
    this.sharedCartItems = allCarts.filter(c => c.table_number === tableNum);
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
    const tableNum = this.getTableNumber();
    
    const allCarts = window.gpStorage.getSharedCarts();
    const existingIdx = allCarts.findIndex(i => i.table_number === tableNum && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existingIdx !== -1) {
      allCarts[existingIdx].quantity--;
      if (allCarts[existingIdx].quantity <= 0) {
        allCarts.splice(existingIdx, 1);
      }
    }
    window.gpStorage.saveSharedCarts(allCarts);
    this.sharedCartItems = allCarts.filter(c => c.table_number === tableNum);
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
        this.clearCartLocally();
      }
    } else {
      this.clearCartLocally();
    }
    this.comboSavings = 0;
    this.onChange();
  }

  clearCartLocally() {
    const tableNum = this.getTableNumber();
    const allCarts = window.gpStorage.getSharedCarts();
    const filtered = allCarts.filter(c => c.table_number !== tableNum);
    window.gpStorage.saveSharedCarts(filtered);
    this.cartData = {};
    this.sharedCartItems = [];
  }

  async clearSharedCarts(tableNum) {
    const targetTable = tableNum || this.getTableNumber();
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { error } = await window.supabaseClient
          .from("shared_carts")
          .delete()
          .eq("table_number", targetTable);
        if (error) throw error;
      } catch (e) {
        console.error("Supabase shared carts clear error, utilizing local fallback:", e);
        this.clearSharedCartsLocally(targetTable);
      }
    } else {
      this.clearSharedCartsLocally(targetTable);
    }
  }

  clearSharedCartsLocally(tableNum) {
    const allCarts = window.gpStorage.getSharedCarts();
    const filtered = allCarts.filter(c => c.table_number !== tableNum);
    window.gpStorage.saveSharedCarts(filtered);
    if (tableNum === this.getTableNumber()) {
      this.cartData = {};
      this.sharedCartItems = [];
      this.onChange();
    }
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
