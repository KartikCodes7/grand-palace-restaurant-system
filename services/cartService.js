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
      
      const tableNum = this.getTableNumber();
      // Try resolving active session
      let active = await this.resolveActiveSession(tableNum);
      if (!active) {
        active = await this.createTableSession(tableNum, name);
      } else {
        await this.joinSessionMember(active.session_id, name);
      }
      this.onChange();
    }
  }

  getSessionId() {
    return localStorage.getItem("gp_current_session_id") || "";
  }

  setSessionId(sid) {
    if (sid) {
      localStorage.setItem("gp_current_session_id", sid);
    } else {
      localStorage.removeItem("gp_current_session_id");
    }
  }

  generateSessionId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let sid = "";
    for (let i = 0; i < 5; i++) {
      sid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return sid;
  }

  async resolveActiveSession(tableNum) {
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("table_sessions")
          .select("*")
          .eq("table_number", tableNum)
          .neq("status", "closed")
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (e) {
        console.error("Supabase resolveActiveSession error:", e);
        return this.resolveActiveSessionLocally(tableNum);
      }
    } else {
      return this.resolveActiveSessionLocally(tableNum);
    }
  }

  resolveActiveSessionLocally(tableNum) {
    const sessions = window.gpStorage.getTableSessions();
    const active = sessions.find(s => s.table_number === tableNum && s.status !== "closed");
    return active || null;
  }

  async createTableSession(tableNum, guestName) {
    const sid = this.generateSessionId();
    const now = new Date().toISOString();
    const sessionData = {
      session_id: sid,
      table_number: tableNum,
      status: "active",
      started_at: now,
      ended_at: null,
      guest_count: 1,
      created_by: guestName.trim()
    };

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { error } = await window.supabaseClient
          .from("table_sessions")
          .insert([sessionData]);
        if (error) throw error;
        
        // Also insert into session_members
        const { error: memErr } = await window.supabaseClient
          .from("session_members")
          .insert([{
            session_id: sid,
            guest_name: guestName.trim(),
            joined_at: now
          }]);
        if (memErr) throw memErr;

        this.setSessionId(sid);
        return sessionData;
      } catch (e) {
        console.error("Supabase createTableSession error, using local fallback:", e);
        return this.createTableSessionLocally(tableNum, guestName, sid, now);
      }
    } else {
      return this.createTableSessionLocally(tableNum, guestName, sid, now);
    }
  }

  createTableSessionLocally(tableNum, guestName, sid, now) {
    sid = sid || this.generateSessionId();
    now = now || new Date().toISOString();
    
    const sessionData = {
      session_id: sid,
      table_number: tableNum,
      status: "active",
      started_at: now,
      ended_at: null,
      guest_count: 1,
      created_by: guestName.trim()
    };

    const sessions = window.gpStorage.getTableSessions();
    sessions.push(sessionData);
    window.gpStorage.saveTableSessions(sessions);

    const members = window.gpStorage.getSessionMembers();
    members.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      session_id: sid,
      guest_name: guestName.trim(),
      joined_at: now
    });
    window.gpStorage.saveSessionMembers(members);

    this.setSessionId(sid);
    return sessionData;
  }

  async joinSessionMember(sessionId, guestName) {
    const now = new Date().toISOString();
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        // Check if member already in session
        const { data: existing, error: checkErr } = await window.supabaseClient
          .from("session_members")
          .select("*")
          .eq("session_id", sessionId)
          .eq("guest_name", guestName.trim())
          .maybeSingle();
        if (checkErr) throw checkErr;

        if (!existing) {
          const { error: insErr } = await window.supabaseClient
            .from("session_members")
            .insert([{
              session_id: sessionId,
              guest_name: guestName.trim(),
              joined_at: now
            }]);
          if (insErr) throw insErr;
          
          // Increment guest count
          const { data: session, error: getErr } = await window.supabaseClient
            .from("table_sessions")
            .select("guest_count")
            .eq("session_id", sessionId)
            .single();
          if (getErr) throw getErr;

          const { error: updErr } = await window.supabaseClient
            .from("table_sessions")
            .update({ guest_count: (session.guest_count || 0) + 1 })
            .eq("session_id", sessionId);
          if (updErr) throw updErr;
        }
        this.setSessionId(sessionId);
      } catch (e) {
        console.error("Supabase joinSessionMember error, using local fallback:", e);
        this.joinSessionMemberLocally(sessionId, guestName, now);
      }
    } else {
      this.joinSessionMemberLocally(sessionId, guestName, now);
    }
  }

  joinSessionMemberLocally(sessionId, guestName, now) {
    now = now || new Date().toISOString();
    const members = window.gpStorage.getSessionMembers();
    const exists = members.find(m => m.session_id === sessionId && m.guest_name === guestName.trim());
    if (!exists) {
      members.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        session_id: sessionId,
        guest_name: guestName.trim(),
        joined_at: now
      });
      window.gpStorage.saveSessionMembers(members);

      // Increment guest count
      const sessions = window.gpStorage.getTableSessions();
      const session = sessions.find(s => s.session_id === sessionId);
      if (session) {
        session.guest_count = (session.guest_count || 0) + 1;
        window.gpStorage.saveTableSessions(sessions);
      }
    }
    this.setSessionId(sessionId);
  }

  async clearTableSessions(tableNum) {
    const targetTable = tableNum || this.getTableNumber();
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const active = await this.resolveActiveSession(targetTable);
        if (active) {
          const { error } = await window.supabaseClient
            .from("table_sessions")
            .update({ status: "closed", ended_at: new Date().toISOString() })
            .eq("session_id", active.session_id);
          if (error) throw error;

          // Clear shared carts associated with this session
          await window.supabaseClient
            .from("shared_carts")
            .delete()
            .eq("session_id", active.session_id);
        }
      } catch (e) {
        console.error("Supabase table sessions clear error, utilizing local fallback:", e);
        this.clearTableSessionsLocally(targetTable);
      }
    } else {
      this.clearTableSessionsLocally(targetTable);
    }

    // If it is the current guest's table, reset their guest name and current session id in localStorage!
    if (targetTable === this.getTableNumber()) {
      localStorage.removeItem("gp_guest_name");
      localStorage.removeItem("gp_current_session_id");
      this.cartData = {};
      this.sharedCartItems = [];
      this.onChange();
    }
  }

  clearTableSessionsLocally(tableNum) {
    const sessions = window.gpStorage.getTableSessions();
    const active = sessions.find(s => s.table_number === tableNum && s.status !== "closed");
    if (active) {
      active.status = "closed";
      active.ended_at = new Date().toISOString();
      window.gpStorage.saveTableSessions(sessions);

      // Clear shared carts associated with this session
      const allCarts = window.gpStorage.getSharedCarts();
      const filteredCarts = allCarts.filter(c => c.session_id !== active.session_id);
      window.gpStorage.saveSharedCarts(filteredCarts);
    }
  }

  async getTableSessions() {
    const tableNum = this.getTableNumber();
    const active = await this.resolveActiveSession(tableNum);
    if (!active) return [];

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("session_members")
          .select("*")
          .eq("session_id", active.session_id);
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error("Supabase table sessions query error:", e);
        return this.getTableSessionsLocally(active.session_id);
      }
    } else {
      return this.getTableSessionsLocally(active.session_id);
    }
  }

  getTableSessionsLocally(sessionId) {
    const members = window.gpStorage.getSessionMembers();
    return members.filter(m => m.session_id === sessionId);
  }

  async getAllActiveSessions() {
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("table_sessions")
          .select("*, session_members(*)")
          .neq("status", "closed");
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error("Supabase getAllActiveSessions error:", e);
        return this.getAllActiveSessionsLocally();
      }
    } else {
      return this.getAllActiveSessionsLocally();
    }
  }

  getAllActiveSessionsLocally() {
    const sessions = window.gpStorage.getTableSessions().filter(s => s.status !== "closed");
    const members = window.gpStorage.getSessionMembers();
    return sessions.map(s => ({
      ...s,
      session_members: members.filter(m => m.session_id === s.session_id)
    }));
  }

  async getAllSessions() {
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("table_sessions")
          .select("*, session_members(*)");
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error("Supabase getAllSessions error:", e);
        return this.getAllSessionsLocally();
      }
    } else {
      return this.getAllSessionsLocally();
    }
  }

  getAllSessionsLocally() {
    const sessions = window.gpStorage.getTableSessions();
    const members = window.gpStorage.getSessionMembers();
    return sessions.map(s => ({
      ...s,
      session_members: members.filter(m => m.session_id === s.session_id)
    }));
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
  /**
   * Synchronizes shared cart database rows with internal cache
   */
  async syncSharedCart() {
    const tableNum = this.getTableNumber();
    const sessionId = this.getSessionId();
    if (!sessionId) {
      this.cartData = {};
      this.sharedCartItems = [];
      return;
    }

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("shared_carts")
          .select("*")
          .eq("table_number", tableNum)
          .eq("session_id", sessionId);

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
    const sessionId = this.getSessionId();
    if (!sessionId) {
      this.cartData = {};
      this.sharedCartItems = [];
      return;
    }
    const allCarts = window.gpStorage.getSharedCarts();
    this.sharedCartItems = allCarts.filter(c => c.table_number === tableNum && c.session_id === sessionId);
    this.cartData = {};
    this.sharedCartItems.forEach((row) => {
      const id = row.menu_item_id;
      this.cartData[id] = (this.cartData[id] || 0) + row.quantity;
    });
  }

  async addToCart(itemId) {
    const tableNum = this.getTableNumber();
    const guestName = this.getGuestName();
    const sessionId = this.getSessionId();
    if (!sessionId) {
      console.warn("No active session, cannot add to cart.");
      return;
    }

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        // Check if item already added by this specific guest in this session
        const { data, error } = await window.supabaseClient
          .from("shared_carts")
          .select("*")
          .eq("table_number", tableNum)
          .eq("session_id", sessionId)
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
              session_id: sessionId,
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
    const sessionId = this.getSessionId();
    if (!sessionId) return;
    
    if (this.cartData[itemId]) {
      this.cartData[itemId]++;
    } else {
      this.cartData[itemId] = 1;
    }
    const guestName = this.getGuestName();
    const tableNum = this.getTableNumber();
    
    const allCarts = window.gpStorage.getSharedCarts();
    const existing = allCarts.find(i => i.table_number === tableNum && i.session_id === sessionId && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existing) {
      existing.quantity++;
    } else {
      allCarts.push({
        id: "cart_" + Date.now() + Math.floor(Math.random() * 1000),
        table_number: tableNum,
        session_id: sessionId,
        guest_name: guestName,
        menu_item_id: itemId,
        quantity: 1
      });
    }
    window.gpStorage.saveSharedCarts(allCarts);
    this.sharedCartItems = allCarts.filter(c => c.table_number === tableNum && c.session_id === sessionId);
  }

  async removeFromCart(itemId) {
    const tableNum = this.getTableNumber();
    const guestName = this.getGuestName();
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from("shared_carts")
          .select("*")
          .eq("table_number", tableNum)
          .eq("session_id", sessionId)
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
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    if (this.cartData[itemId]) {
      this.cartData[itemId]--;
      if (this.cartData[itemId] <= 0) {
        delete this.cartData[itemId];
      }
    }
    const guestName = this.getGuestName();
    const tableNum = this.getTableNumber();
    
    const allCarts = window.gpStorage.getSharedCarts();
    const existingIdx = allCarts.findIndex(i => i.table_number === tableNum && i.session_id === sessionId && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existingIdx !== -1) {
      allCarts[existingIdx].quantity--;
      if (allCarts[existingIdx].quantity <= 0) {
        allCarts.splice(existingIdx, 1);
      }
    }
    window.gpStorage.saveSharedCarts(allCarts);
    this.sharedCartItems = allCarts.filter(c => c.table_number === tableNum && c.session_id === sessionId);
  }

  async clearCart() {
    const tableNum = this.getTableNumber();
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const { error } = await window.supabaseClient
          .from("shared_carts")
          .delete()
          .eq("table_number", tableNum)
          .eq("session_id", sessionId);
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
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    const allCarts = window.gpStorage.getSharedCarts();
    const filtered = allCarts.filter(c => !(c.table_number === tableNum && c.session_id === sessionId));
    window.gpStorage.saveSharedCarts(filtered);
    this.cartData = {};
    this.sharedCartItems = [];
  }

  async clearSharedCarts(tableNum) {
    const targetTable = tableNum || this.getTableNumber();
    const active = await this.resolveActiveSession(targetTable);
    if (active) {
      if (window.supabaseEnabled && window.supabaseClient) {
        try {
          const { error } = await window.supabaseClient
            .from("shared_carts")
            .delete()
            .eq("table_number", targetTable)
            .eq("session_id", active.session_id);
          if (error) throw error;
        } catch (e) {
          console.error("Supabase shared carts clear error, utilizing local fallback:", e);
          this.clearSharedCartsLocally(targetTable, active.session_id);
        }
      } else {
        this.clearSharedCartsLocally(targetTable, active.session_id);
      }
    }
  }

  clearSharedCartsLocally(tableNum, sessionId) {
    const allCarts = window.gpStorage.getSharedCarts();
    const filtered = allCarts.filter(c => !(c.table_number === tableNum && c.session_id === sessionId));
    window.gpStorage.saveSharedCarts(filtered);
    if (tableNum === this.getTableNumber() && sessionId === this.getSessionId()) {
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
