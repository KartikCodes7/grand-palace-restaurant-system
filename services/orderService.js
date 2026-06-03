/**
 * OrderService - Orchestrates dining timeline progressions, bill summaries, and states.
 * Supports direct Supabase orders/order_items transaction queries and dynamic localStorage fallbacks.
 */
class OrderService {
  constructor() {
    this.ordersList = [];
  }

  /**
   * Syncs internal cache from Supabase or fallback storage
   */
  async syncOrders() {
    if (window.supabaseEnabled) {
      try {
        const { data, error } = await window.supabaseClient
          .from("orders")
          .select("*, order_items(*)")
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Map database naming schema back to client structures
        this.ordersList = data.map((order) => {
          // Re-create history completed tags based on status
          const statusOrder = ["Order Placed", "Accepted", "Preparing", "Ready", "Served", "Settled"];
          const currentIdx = statusOrder.indexOf(order.status);
          const history = statusOrder.map((status, index) => ({
            status: status,
            completed: index <= currentIdx
          }));

          return {
            id: order.id,
            tableNumber: order.table_number,
            sessionId: order.session_id,
            status: order.status,
            subtotal: Number(order.subtotal),
            tax: Number(order.tax),
            serviceCharge: Number(order.service_charge),
            total: Number(order.total),
            eta: order.eta || "20 mins",
            timestamp: order.timestamp,
            date: new Date(order.created_at).toLocaleDateString(),
            createdAt: order.created_at,
            items: order.order_items.map(i => ({
              name: i.name,
              quantity: i.quantity,
              price: Number(i.price)
            })),
            history: history
          };
        });
      } catch (e) {
        console.error("Supabase orders sync error, using fallback storage:", e);
        this.ordersList = window.gpStorage.getOrders();
      }
    } else {
      this.ordersList = window.gpStorage.getOrders();
    }
  }

  async getActiveOrders(tableNumber = "5") {
    await this.syncOrders();
    const activeSession = await window.cartService.resolveActiveSession(tableNumber);
    if (!activeSession) return [];

    return this.ordersList.filter(o => {
      const matchTable = o.tableNumber === tableNumber;
      const matchStatus = o.status !== "Served" && o.status !== "Settled";
      if (!matchTable || !matchStatus) return false;
      
      if (window.supabaseDbUpgraded && window.supabaseOrdersHasSessionId) {
        return o.sessionId === activeSession.session_id || o.session_id === activeSession.session_id;
      }
      
      // Fallback/hybrid session isolation based on timestamp + local session ID
      const orderSessionId = o.sessionId || o.session_id;
      if (orderSessionId) {
        return orderSessionId === activeSession.session_id;
      }
      
      // If order has no session ID (e.g. online DB orders when not upgraded), isolate by timestamp
      const orderTime = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      const sessionTime = activeSession.started_at ? new Date(activeSession.started_at).getTime() : 0;
      return orderTime >= (sessionTime - 60000); // 1-minute clock drift grace period
    });
  }

  async getOrderHistory(tableNumber = "5") {
    await this.syncOrders();
    const activeSession = await window.cartService.resolveActiveSession(tableNumber);
    if (!activeSession) return [];

    return this.ordersList.filter(o => {
      const matchTable = o.tableNumber === tableNumber;
      const matchStatus = o.status === "Served" || o.status === "Settled";
      if (!matchTable || !matchStatus) return false;
      
      if (window.supabaseDbUpgraded && window.supabaseOrdersHasSessionId) {
        return o.sessionId === activeSession.session_id || o.session_id === activeSession.session_id;
      }
      
      // Fallback/hybrid session isolation based on timestamp + local session ID
      const orderSessionId = o.sessionId || o.session_id;
      if (orderSessionId) {
        return orderSessionId === activeSession.session_id;
      }
      
      // If order has no session ID (e.g. online DB orders when not upgraded), isolate by timestamp
      const orderTime = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      const sessionTime = activeSession.started_at ? new Date(activeSession.started_at).getTime() : 0;
      return orderTime >= (sessionTime - 60000); // 1-minute clock drift grace period
    });
  }

  async submitOrder(items, totals, tableNumber = "5") {
    const orderId = `ORD${Math.floor(100 + Math.random() * 900)}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sessionId = window.cartService.getSessionId();

    if (window.supabaseEnabled) {
      try {
        const newOrderRow = {
          id: orderId,
          table_number: tableNumber,
          status: "Order Placed",
          subtotal: totals.subtotal,
          tax: totals.tax,
          service_charge: totals.serviceCharge,
          total: totals.grandTotal,
          eta: "20 mins",
          timestamp: timestamp
        };

        if (window.supabaseDbUpgraded && window.supabaseOrdersHasSessionId) {
          newOrderRow.session_id = sessionId || null;
        }

        const { error: orderErr } = await window.supabaseClient
          .from("orders")
          .insert([newOrderRow]);
        if (orderErr) throw orderErr;

        const orderItemsRows = items.map(i => ({
          order_id: orderId,
          name: i.item.name,
          quantity: i.quantity,
          price: i.item.price
        }));

        const { error: itemsErr } = await window.supabaseClient
          .from("order_items")
          .insert(orderItemsRows);
        if (itemsErr) throw itemsErr;

        // Sync local cache
        await this.syncOrders();
        return this.ordersList.find(o => o.id === orderId);
      } catch (e) {
        console.error("Supabase order submit error, placing locally:", e);
        return this.submitOrderLocally(orderId, timestamp, items, totals, tableNumber);
      }
    } else {
      return this.submitOrderLocally(orderId, timestamp, items, totals, tableNumber);
    }
  }

  submitOrderLocally(orderId, timestamp, items, totals, tableNumber) {
    const sessionId = window.cartService.getSessionId();
    const newOrder = {
      id: orderId,
      sessionId: sessionId || null,
      session_id: sessionId || null,
      items: items.map(i => ({ name: i.item.name, quantity: i.quantity, price: i.item.price })),
      subtotal: totals.subtotal,
      tax: totals.tax,
      serviceCharge: totals.serviceCharge,
      total: totals.grandTotal,
      tableNumber: tableNumber,
      status: "Order Placed",
      eta: "20 mins",
      timestamp: timestamp,
      date: new Date().toLocaleDateString(),
      createdAt: new Date().toISOString(),
      history: [
        { status: "Order Placed", completed: true },
        { status: "Accepted", completed: false },
        { status: "Preparing", completed: false },
        { status: "Ready", completed: false },
        { status: "Served", completed: false }
      ]
    };

    this.ordersList = window.gpStorage.getOrders();
    this.ordersList.unshift(newOrder);
    window.gpStorage.saveOrders(this.ordersList);
    
    // Automatic background sequence simulation (local only)
    this.simulateOrderProgression(orderId);
    
    return newOrder;
  }

  /**
   * Guest side automatic timeline transitions (local fallback only)
   */
  simulateOrderProgression(orderId) {
    const steps = [
      { status: "Accepted", delay: 15000, eta: "15 mins" },
      { status: "Preparing", delay: 30000, eta: "10 mins" },
      { status: "Ready", delay: 50000, eta: "2 mins" },
      { status: "Served", delay: 70000, eta: "0 mins" }
    ];

    steps.forEach((step) => {
      setTimeout(async () => {
        if (window.supabaseEnabled) return; // Block mock simulation when online
        
        await this.syncOrders();
        const order = this.ordersList.find(o => o.id === orderId);
        
        if (order && !order.manualOverride && order.status !== "Served") {
          order.status = step.status;
          order.eta = step.eta;
          
          const statusOrder = ["Order Placed", "Accepted", "Preparing", "Ready", "Served"];
          const currentIdx = statusOrder.indexOf(step.status);
          order.history = order.history.map((h, index) => ({
            ...h,
            completed: index <= currentIdx
          }));

          window.gpStorage.saveOrders(this.ordersList);
          
          if (window.onAppStateChanged) {
            window.onAppStateChanged();
          }

          if (step.status === "Served" && window.promptFeedbackOverlay) {
            window.promptFeedbackOverlay(orderId);
          }
        }
      }, step.delay);
    });
  }

  /**
   * Manual timeline progress status updates by the proprietor
   */
  async updateOrderStatus(orderId, newStatus) {
    await this.syncOrders();
    const order = this.ordersList.find(o => o.id === orderId);
    
    if (order) {
      const states = ["Order Placed", "Accepted", "Preparing", "Ready", "Served"];
      const currentIdx = states.indexOf(order.status);
      const targetIdx = states.indexOf(newStatus);
      if (targetIdx !== -1 && targetIdx < currentIdx) {
        console.warn(`Blocked invalid backwards state transition: ${order.status} -> ${newStatus}`);
        return order;
      }
    }

    if (window.supabaseEnabled) {
      try {
        let eta = "20 mins";
        if (newStatus === "Accepted") eta = "15 mins";
        else if (newStatus === "Preparing") eta = "10 mins";
        else if (newStatus === "Ready") eta = "2 mins";
        else if (newStatus === "Served") eta = "0 mins";

        const { error } = await window.supabaseClient
          .from("orders")
          .update({ status: newStatus, eta: eta })
          .eq("id", orderId);
          
        if (error) throw error;
        await this.syncOrders();
        return this.ordersList.find(o => o.id === orderId);
      } catch (e) {
        console.error("Supabase order status update error, saving locally:", e);
        return this.updateOrderStatusLocally(orderId, newStatus);
      }
    } else {
      return this.updateOrderStatusLocally(orderId, newStatus);
    }
  }

  updateOrderStatusLocally(orderId, newStatus) {
    this.ordersList = window.gpStorage.getOrders();
    const order = this.ordersList.find(o => o.id === orderId);
    if (!order) return;

    order.status = newStatus;
    order.manualOverride = true; 

    if (newStatus === "Accepted") order.eta = "15 mins";
    else if (newStatus === "Preparing") order.eta = "10 mins";
    else if (newStatus === "Ready") order.eta = "2 mins";
    else if (newStatus === "Served") order.eta = "0 mins";

    let hitCurrent = false;
    order.history = order.history.map(h => {
      if (h.status === newStatus) {
        hitCurrent = true;
        return { ...h, completed: true };
      }
      if (!hitCurrent) {
        return { ...h, completed: true };
      }
      return { ...h, completed: false };
    });

    window.gpStorage.saveOrders(this.ordersList);
    return order;
  }
}

window.orderService = new OrderService();
