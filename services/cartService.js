/**
 * CartService - Manages active cart state, items lists, and pricing totals.
 * Fully integrated with Supabase shared_carts table to support realtime multi-guest dining.
 */
class CartService {
  constructor() {
    this.cartData = {}; // Maps itemId -> quantity (aggregated for compatibility)
    this.sharedCartItems = []; // Raw records representing { guest_name, menu_item_id, quantity }
    this.comboSavings = 0; // Dynamic savings from AI combo upgrades
    
    // Check if Supabase schema is upgraded
    window.supabaseDbUpgraded = false;
    window.supabaseOrdersHasSessionId = false;
    window.supabaseFeedbackHasSessionId = false;
    this.schemaCheckPromise = this.checkSchemaUpgraded();

    // Background offline cart sync retry queue
    this.pendingSyncQueue = window.gpStorage.get("gp_pending_cart_syncs", []);
    this.isSyncingQueue = false;
    this.startQueueSyncLoop();
  }

  startQueueSyncLoop() {
    if (this.queueSyncInterval) clearInterval(this.queueSyncInterval);
    this.queueSyncInterval = setInterval(() => {
      if (window.gpNetworkOnline && this.pendingSyncQueue && this.pendingSyncQueue.length > 0) {
        this.flushPendingSyncs();
      }
    }, 10000);
  }

  async queueCartSync(itemId, targetQty) {
    if (!this.pendingSyncQueue) this.pendingSyncQueue = [];
    this.pendingSyncQueue = this.pendingSyncQueue.filter(q => q.itemId !== itemId);
    this.pendingSyncQueue.push({ itemId, targetQty, timestamp: Date.now() });
    window.gpStorage.set("gp_pending_cart_syncs", this.pendingSyncQueue);
    
    if (window.gpNetworkOnline) {
      this.flushPendingSyncs();
    }
  }

  async flushPendingSyncs() {
    if (this.isSyncingQueue) return;
    this.isSyncingQueue = true;
    
    while (this.pendingSyncQueue && this.pendingSyncQueue.length > 0) {
      const item = this.pendingSyncQueue[0];
      try {
        await this.syncItemQtyToSupabaseDirect(item.itemId, item.targetQty);
        this.pendingSyncQueue.shift();
        window.gpStorage.set("gp_pending_cart_syncs", this.pendingSyncQueue);
      } catch (e) {
        console.error("Flush pending sync failed for item:", item.itemId, e);
        break;
      }
    }
    this.isSyncingQueue = false;
  }


  async checkSchemaUpgraded() {
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        // 1. Check if session management tables exist
        const { error: sessionErr } = await window.supabaseClient
          .from("table_sessions")
          .select("session_id")
          .limit(1);
        if (!sessionErr) {
          window.supabaseDbUpgraded = true;
          console.log("👑 Grand Palace Backend: Session Management Schema is ACTIVE in Supabase.");
        } else {
          console.log("⚠️ Grand Palace Backend: Session Management Schema not detected in Supabase. Running in hybrid session isolation.");
        }

        // 2. Check if orders table has session_id column
        const { error: orderErr } = await window.supabaseClient
          .from("orders")
          .select("session_id")
          .limit(1);
        if (!orderErr) {
          window.supabaseOrdersHasSessionId = true;
          console.log("👑 Grand Palace Backend: orders.session_id column is ACTIVE in Supabase.");
        } else {
          console.log("⚠️ Grand Palace Backend: orders.session_id column not detected in Supabase.");
        }

        // 3. Check if feedback table has session_id column
        const { error: feedbackErr } = await window.supabaseClient
          .from("feedback")
          .select("session_id")
          .limit(1);
        if (!feedbackErr) {
          window.supabaseFeedbackHasSessionId = true;
          console.log("👑 Grand Palace Backend: feedback.session_id column is ACTIVE in Supabase.");
        } else {
          console.log("⚠️ Grand Palace Backend: feedback.session_id column not detected in Supabase.");
        }
      } catch (e) {
        console.log("⚠️ Grand Palace Backend: Schema check error. Running in hybrid session isolation.", e);
      }
    }
  }

  getGuestName() {
    const tableNum = this.getTableNumber();
    return localStorage.getItem("gp_guest_name_t" + tableNum) || "Guest";
  }

  async setGuestName(name) {
    if (name && name.trim() !== "") {
      const tableNum = this.getTableNumber();
      localStorage.setItem("gp_guest_name_t" + tableNum, name.trim());
      
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
    const tableNum = this.getTableNumber();
    return localStorage.getItem("gp_current_session_id_t" + tableNum) || "";
  }

  setSessionId(sid) {
    const tableNum = this.getTableNumber();
    if (sid) {
      localStorage.setItem("gp_current_session_id_t" + tableNum, sid);
    } else {
      localStorage.removeItem("gp_current_session_id_t" + tableNum);
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
    if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
      try {
        const { data, error } = await window.supabaseClient
          .from("table_sessions")
          .select("*")
          .eq("table_number", tableNum)
          .neq("status", "closed")
          .maybeSingle();
        if (error) throw error;
        
        if (data && this.isSessionStale(data)) {
          console.log(`⚠️ Stale online table session detected for table ${tableNum}. Auto-clearing.`);
          await this.clearTableSessions(tableNum);
          return null;
        }
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
    
    if (active && this.isSessionStale(active)) {
      console.log(`⚠️ Stale local table session detected for table ${tableNum}. Auto-clearing.`);
      this.clearTableSessionsLocally(tableNum);
      
      // If it is the current guest's table, reset their guest name and current session id in localStorage!
      if (tableNum === this.getTableNumber()) {
        localStorage.removeItem("gp_guest_name_t" + tableNum);
        localStorage.removeItem("gp_current_session_id_t" + tableNum);
        this.cartData = {};
        this.sharedCartItems = [];
        this.onChange();
      }
      return null;
    }
    return active || null;
  }

  isSessionStale(session) {
    if (!session || !session.started_at) return false;
    const start = new Date(session.started_at).getTime();
    const now = Date.now();
    const diffHours = (now - start) / (1000 * 60 * 60);
    return diffHours > 6; // Stale if older than 6 hours
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

    if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
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
    if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
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
    if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
      try {
        // Direct query without going through resolveActiveSession to prevent recursion
        const { data: active, error: fetchError } = await window.supabaseClient
          .from("table_sessions")
          .select("*")
          .eq("table_number", targetTable)
          .neq("status", "closed")
          .maybeSingle();
        if (fetchError) throw fetchError;
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

    this._lastActiveSessionsSync = 0;
    this._lastAllSessionsSync = 0;

    // If it is the current guest's table, reset their guest name and current session id in localStorage!
    if (targetTable === this.getTableNumber()) {
      localStorage.removeItem("gp_guest_name_t" + targetTable);
      localStorage.removeItem("gp_current_session_id_t" + targetTable);
      this.cartData = {};
      this.sharedCartItems = [];
      this.onChange();
    }
  }

  clearTableSessionsLocally(tableNum) {
    this._lastActiveSessionsSync = 0;
    this._lastAllSessionsSync = 0;
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

    if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
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

  async getAllActiveSessions(force = false) {
    const now = Date.now();
    if (!force && this._lastActiveSessionsSync && (now - this._lastActiveSessionsSync < 1500) && this._cachedActiveSessions) {
      return this._cachedActiveSessions;
    }

    if (this._activeSessionsPromise) {
      return this._activeSessionsPromise;
    }

    this._activeSessionsPromise = (async () => {
      try {
        if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
          try {
            const { data, error } = await window.supabaseClient
              .from("table_sessions")
              .select("*, session_members(*)")
              .neq("status", "closed");
            if (error) throw error;
            this._cachedActiveSessions = data || [];
            this._lastActiveSessionsSync = Date.now();
            return this._cachedActiveSessions;
          } catch (e) {
            console.error("Supabase getAllActiveSessions error:", e);
            this._cachedActiveSessions = this.getAllActiveSessionsLocally();
            this._lastActiveSessionsSync = Date.now();
            return this._cachedActiveSessions;
          }
        } else {
          this._cachedActiveSessions = this.getAllActiveSessionsLocally();
          this._lastActiveSessionsSync = Date.now();
          return this._cachedActiveSessions;
        }
      } finally {
        this._activeSessionsPromise = null;
      }
    })();

    return this._activeSessionsPromise;
  }

  getAllActiveSessionsLocally() {
    const sessions = window.gpStorage.getTableSessions().filter(s => s.status !== "closed");
    const members = window.gpStorage.getSessionMembers();
    return sessions.map(s => ({
      ...s,
      session_members: members.filter(m => m.session_id === s.session_id)
    }));
  }

  async getAllSessions(force = false) {
    const now = Date.now();
    if (!force && this._lastAllSessionsSync && (now - this._lastAllSessionsSync < 1500) && this._cachedAllSessions) {
      return this._cachedAllSessions;
    }

    if (this._allSessionsPromise) {
      return this._allSessionsPromise;
    }

    this._allSessionsPromise = (async () => {
      try {
        if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
          try {
            const { data, error } = await window.supabaseClient
              .from("table_sessions")
              .select("*, session_members(*)");
            if (error) throw error;
            this._cachedAllSessions = data || [];
            this._lastAllSessionsSync = Date.now();
            return this._cachedAllSessions;
          } catch (e) {
            console.error("Supabase getAllSessions error:", e);
            this._cachedAllSessions = this.getAllSessionsLocally();
            this._lastAllSessionsSync = Date.now();
            return this._cachedAllSessions;
          }
        } else {
          this._cachedAllSessions = this.getAllSessionsLocally();
          this._lastAllSessionsSync = Date.now();
          return this._cachedAllSessions;
        }
      } finally {
        this._allSessionsPromise = null;
      }
    })();

    return this._allSessionsPromise;
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
    // 1. Try URL search params (?table=X)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const fromParam = urlParams.get('table');
      if (fromParam) return fromParam;
    } catch (e) {}

    // 2. Try URL pathname (/table/X)
    try {
      const pathMatch = window.location.pathname.match(/\/table\/(\d+)/i);
      if (pathMatch) return pathMatch[1];
    } catch (e) {}

    // 3. Fallback to window.App (if exposed globally)
    if (window.App && window.App.tableNumber) return window.App.tableNumber;

    // 4. Default
    return "5";
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
    const tableNum = this.getTableNumber();
    const sessionId = this.getSessionId();
    if (!sessionId) {
      this.cartData = {};
      this.sharedCartItems = [];
      return;
    }

    if (window.supabaseEnabled && window.supabaseClient && window.supabaseDbUpgraded) {
      try {
        let query = window.supabaseClient
          .from("shared_carts")
          .select("*")
          .eq("table_number", tableNum);
        
        if (window.supabaseDbUpgraded) {
          query = query.eq("session_id", sessionId);
        }

        const { data, error } = await query;
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

  async syncItemQtyToSupabase(itemId, targetQty) {
    if (!window.supabaseEnabled || !window.supabaseClient || !window.supabaseDbUpgraded) return;
    await this.queueCartSync(itemId, targetQty);
  }

  async syncItemQtyToSupabaseDirect(itemId, targetQty) {
    if (!window.supabaseEnabled || !window.supabaseClient || !window.supabaseDbUpgraded) return;

    const tableNum = this.getTableNumber();
    const guestName = this.getGuestName();
    const sessionId = this.getSessionId();

    let query = window.supabaseClient
      .from("shared_carts")
      .select("*")
      .eq("table_number", tableNum)
      .eq("guest_name", guestName)
      .eq("menu_item_id", itemId);

    if (window.supabaseDbUpgraded) {
      query = query.eq("session_id", sessionId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    if (targetQty <= 0) {
      if (data) {
        const { error: delErr } = await window.supabaseClient
          .from("shared_carts")
          .delete()
          .eq("id", data.id);
        if (delErr) throw delErr;
      }
    } else {
      if (data) {
        if (data.quantity !== targetQty) {
          const { error: updErr } = await window.supabaseClient
            .from("shared_carts")
            .update({ quantity: targetQty })
            .eq("id", data.id);
          if (updErr) throw updErr;
        }
      } else {
        const newCartRow = {
          table_number: tableNum,
          guest_name: guestName,
          menu_item_id: itemId,
          quantity: targetQty
        };
        if (window.supabaseDbUpgraded) {
          newCartRow.session_id = sessionId;
        }
        const { error: insErr } = await window.supabaseClient
          .from("shared_carts")
          .insert([newCartRow]);
        if (insErr) throw insErr;
      }
    }
  }


  async addToCart(itemId) {
    const tableNum = this.getTableNumber();
    const guestName = this.getGuestName();
    const sessionId = this.getSessionId();
    if (!sessionId) {
      console.warn("No active session, cannot add to cart.");
      if (window.showToast) {
        window.showToast("SESSION REQUIRED", "Please enter your name to start ordering.", "person");
      }
      // Re-show guest name overlay
      const overlay = document.getElementById("guest-name-overlay");
      if (overlay) overlay.classList.remove("hidden");
      return;
    }

    // 1. Optimistic Local Cache Update
    this.cartData[itemId] = Math.max(0, Math.floor((this.cartData[itemId] || 0) + 1));
    
    const existing = this.sharedCartItems.find(i => i.table_number === tableNum && i.session_id === sessionId && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existing) {
      existing.quantity = this.cartData[itemId];
    } else {
      this.sharedCartItems.push({
        id: "cart_opt_" + Date.now() + Math.floor(Math.random() * 1000),
        table_number: tableNum,
        session_id: sessionId,
        guest_name: guestName,
        menu_item_id: itemId,
        quantity: 1
      });
    }

    const allCarts = window.gpStorage.getSharedCarts();
    const existingLocal = allCarts.find(i => i.table_number === tableNum && i.session_id === sessionId && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existingLocal) {
      existingLocal.quantity = this.cartData[itemId];
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

    // 2. Snappy UI response
    this.onChange();

    // 3. Debounced background Supabase write (coalesces rapid clicks within 300ms)
    if (!this.pendingSyncs) this.pendingSyncs = {};
    if (this.pendingSyncs[itemId]) clearTimeout(this.pendingSyncs[itemId]);

    const targetQty = this.cartData[itemId];
    this.pendingSyncs[itemId] = setTimeout(async () => {
      await this.syncItemQtyToSupabase(itemId, targetQty);
      delete this.pendingSyncs[itemId];
    }, 300);
  }

  async removeFromCart(itemId) {
    const tableNum = this.getTableNumber();
    const guestName = this.getGuestName();
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    // 1. Optimistic Local Cache Update
    if (!this.cartData[itemId]) return;
    
    this.cartData[itemId] = Math.max(0, Math.floor((this.cartData[itemId] || 0) - 1));
    const targetQty = this.cartData[itemId];
    if (targetQty <= 0) {
      delete this.cartData[itemId];
    }

    const existingIdx = this.sharedCartItems.findIndex(i => i.table_number === tableNum && i.session_id === sessionId && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existingIdx !== -1) {
      if (targetQty <= 0) {
        this.sharedCartItems.splice(existingIdx, 1);
      } else {
        this.sharedCartItems[existingIdx].quantity = targetQty;
      }
    }

    const allCarts = window.gpStorage.getSharedCarts();
    const existingLocalIdx = allCarts.findIndex(i => i.table_number === tableNum && i.session_id === sessionId && i.menu_item_id === itemId && i.guest_name === guestName);
    if (existingLocalIdx !== -1) {
      if (targetQty <= 0) {
        allCarts.splice(existingLocalIdx, 1);
      } else {
        allCarts[existingLocalIdx].quantity = targetQty;
      }
    }
    window.gpStorage.saveSharedCarts(allCarts);

    if (this.getTotalCount() === 0) {
      this.comboSavings = 0;
    }

    // 2. Snappy UI response
    this.onChange();

    // 3. Debounced background Supabase write (coalesces rapid clicks within 300ms)
    if (!this.pendingSyncs) this.pendingSyncs = {};
    if (this.pendingSyncs[itemId]) clearTimeout(this.pendingSyncs[itemId]);

    this.pendingSyncs[itemId] = setTimeout(async () => {
      await this.syncItemQtyToSupabase(itemId, targetQty);
      delete this.pendingSyncs[itemId];
    }, 300);
  }

  async clearCart() {
    const tableNum = this.getTableNumber();
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        let query = window.supabaseClient
          .from("shared_carts")
          .delete()
          .eq("table_number", tableNum);
        
        if (window.supabaseDbUpgraded) {
          query = query.eq("session_id", sessionId);
        }

        const { error } = await query;
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
          let query = window.supabaseClient
            .from("shared_carts")
            .delete()
            .eq("table_number", targetTable);
          
          if (window.supabaseDbUpgraded) {
            query = query.eq("session_id", active.session_id);
          }

          const { error } = await query;
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

  async requestBill(tableNum) {
    const targetTable = tableNum || this.getTableNumber();
    if (window.supabaseEnabled && window.supabaseClient) {
      try {
        const active = await this.resolveActiveSession(targetTable);
        if (active) {
          const { error } = await window.supabaseClient
            .from("table_sessions")
            .update({ status: "bill_requested" })
            .eq("session_id", active.session_id);
          if (error) throw error;
        }
      } catch (e) {
        console.error("Supabase requestBill error, using local fallback:", e);
        this.requestBillLocally(targetTable);
      }
    } else {
      this.requestBillLocally(targetTable);
    }
  }

  requestBillLocally(tableNum) {
    const sessions = window.gpStorage.getTableSessions();
    const active = sessions.find(s => s.table_number === tableNum && s.status !== "closed");
    if (active) {
      active.status = "bill_requested";
      window.gpStorage.saveTableSessions(sessions);
    }
  }

  resetLocalSessionCart() {
    const tableNum = this.getTableNumber();
    this.cartData = {};
    this.sharedCartItems = [];
    localStorage.removeItem("gp_guest_name_t" + tableNum);
    localStorage.removeItem("gp_current_session_id_t" + tableNum);
    this.onChange();
  }
}

window.cartService = new CartService();
