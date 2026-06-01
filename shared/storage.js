/**
 * shared/storage.js - Orchestrates local storage data persistence for the Grand Palace.
 * Seeds initial gourmet catalog, order timelines, and feedback comments on first launch.
 */
class GrandPalaceStorage {
  constructor() {
    this.KEYS = {
      MENU: "gp_menu_catalog",
      ORDERS: "gp_orders_list",
      FEEDBACKS: "gp_feedbacks_list",
      SESSION: "gp_owner_session",
      TABLE_SESSIONS: "gp_table_sessions",
      SESSION_MEMBERS: "gp_session_members",
      SHARED_CARTS: "gp_shared_carts"
    };
    
    this.seedInitialData();
  }

  /**
   * Reads from localStorage with fallback
   */
  get(key, fallback = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`Storage read error for key [${key}]:`, e);
      return fallback;
    }
  }

  /**
   * Writes to localStorage
   */
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      // Dispatch a storage event manually in case changes occur in the SAME tab/window
      const event = new Event("storage_manual_update");
      window.dispatchEvent(event);
    } catch (e) {
      console.error(`Storage write error for key [${key}]:`, e);
    }
  }

  /**
   * Seeds initial gourmet fine-dining menu and mock active orders on first load
   */
  seedInitialData() {
    // 1. Seed Menu Catalog
    if (!localStorage.getItem(this.KEYS.MENU)) {
      const initialMenu = [
        // Starters
        { id: "st_1", name: "Veg Crispy", description: "Fresh farm vegetables batter-fried to crunchy golden brown, tossed in honey-chili glaze.", price: 179, category: "Starters", image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "st_2", name: "Paneer Crispy", description: "Soft paneer chunks double batter-fried and glazed in hot schezwan-infused garlic sauce.", price: 229, category: "Starters", image: "https://images.unsplash.com/photo-1567188040759-fb8a883db6d8?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "st_3", name: "Chicken Crispy", description: "Tender shredded chicken crispy fried, seasoned in oriental aromatic spice and spring onions.", price: 259, category: "Starters", image: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "st_4", name: "Veg Manchurian", description: "Sautéed minced vegetable dumplings simmered in rich ginger-garlic soy coriander gravy.", price: 189, category: "Starters", image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "st_5", name: "Chicken Manchurian", description: "Juicy chicken chunks cooked in classical sweet-spicy dark manchurian ginger glaze.", price: 249, category: "Starters", image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "st_6", name: "Spring Roll", description: "Crispy outer roll wrap stuffed with wok-tossed savory vegetables and crystal noodles.", price: 199, category: "Starters", image: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "st_7", name: "Paneer Chilli", description: "Soft paneer cubes tossed with fresh green capsicum, onions, and dark chili paste.", price: 239, category: "Starters", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "st_8", name: "Chicken Chilli", description: "Crispy chicken strips, wok-tossed in sharp garlic, green chilies, and light soy broth.", price: 269, category: "Starters", image: "https://images.unsplash.com/photo-1598515213692-5f252f75d785?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },

        // Main Course
        { id: "mc_1", name: "Veg Kolhapuri", description: "Hot & fiery vegetable medley slow-simmered in Kolhapur's heritage roasted spice gravy.", price: 249, category: "Main Course", image: "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "mc_2", name: "Veg Handi", description: "Fresh selection of garden greens and paneer simmered in a warm yellow gravy in copper handi.", price: 269, category: "Main Course", image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "mc_3", name: "Veg Jaipuri", description: "Curated vegetables dry-roasted in creamy tomato gravy, garnished with crispy roasted papad.", price: 279, category: "Main Course", image: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "mc_4", name: "Paneer Butter Masala", description: "Mouth-watering paneer cubes prepared in a rich, velvety orange cream tomato gravy.", price: 299, category: "Main Course", image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "mc_5", name: "Paneer Tikka Masala", description: "Today's special! Tandoor roasted paneer cooked in heavily spiced thick red butter gravy.", price: 319, category: "Main Course", image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80", popular: true, special: true, inStock: true },
        { id: "mc_6", name: "Dal Fry", description: "Nutritious boiled yellow pigeon lentils cooked with onions, tomatoes, and coriander.", price: 179, category: "Main Course", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "mc_7", name: "Dal Tadka", description: "Dal fry tempered in pure ghee with aromatic cumin seeds, fried garlic, and hot red chilies.", price: 199, category: "Main Course", image: "https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "mc_8", name: "Jeera Rice", description: "Basmati rice tossed in hot ghee with generous roasted aromatic cumin seeds.", price: 149, category: "Main Course", image: "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "mc_9", name: "Steam Rice", description: "Premium basmati rice steamed soft, perfectly complementing dal fry and curries.", price: 129, category: "Main Course", image: "https://images.unsplash.com/photo-1516685018646-549198525c1b?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },

        // Chinese Khajana
        { id: "ch_1", name: "Veg Fried Rice", description: "Stir-fried basmati rice with finely diced seasonal greens and savory aromatic soy seasonings.", price: 189, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ch_2", name: "Chicken Fried Rice", description: "Fried rice tossed with tender shredded chicken strips, egg scrambles, and spring onions.", price: 249, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "ch_3", name: "Schezwan Rice", description: "Hot basmati rice fried in our house authentic spicy and hot Schezwan peppercorn paste.", price: 219, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1603133872475-43a0d5c074ea?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ch_4", name: "Triple Rice", description: "A combination of fried rice, crispy noodles, and spicy Schezwan gravy served layered.", price: 289, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1618413813955-4cf5bb627b0b?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "ch_5", name: "Veg Noodles", description: "Hakka style wheat noodles wok-tossed with julienned vegetables and light soy dressing.", price: 189, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ch_6", name: "Chicken Noodles", description: "Wheat noodles stir-fried with juicy seasoned chicken cubes, egg flakes, and greens.", price: 249, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1617093727343-374698b1b08d?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ch_7", name: "Schezwan Noodles", description: "Wok-tossed wheat noodles glazed in a fiery, hot red Schezwan chili paste.", price: 219, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ch_8", name: "Dragon Rice", description: "Basmati rice wok-fried in a sweet-spicy garlic blend, topped with crispy chicken flakes.", price: 279, category: "Chinese Khajana", image: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },

        // Beverages
        { id: "bv_1", name: "Fresh Lime Soda", description: "Refreshing cold aerated soda hand-mixed with freshly squeezed limes, salt, and mint.", price: 89, category: "Beverages", image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "bv_2", name: "Cold Coffee", description: "Creamy whipped dark roast coffee, blended with fresh organic milk and vanilla bean extract.", price: 149, category: "Beverages", image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "bv_3", name: "Masala Chaas", description: "Chilled whipped yogurt milk blended with direct-ground cumin, green chilies, and black salt.", price: 69, category: "Beverages", image: "https://images.unsplash.com/photo-1630985827607-e6498526ce3b?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "bv_4", name: "Mineral Water", description: "Chilled Himalayan natural spring water processed for absolute safety.", price: 30, category: "Beverages", image: "https://images.unsplash.com/photo-1616118132534-381148898bb4?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "bv_5", name: "Fresh Juice", description: "Seasonal fresh-squeezed organic fruit juices (Orange, Pineapple, or Sweet Lime).", price: 119, category: "Beverages", image: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },

        // Ice Cream
        { id: "ic_1", name: "Vanilla", description: "Classic creamy ice cream prepared with direct-import Madagascan vanilla orchid bean pods.", price: 79, category: "Ice Cream", image: "https://images.unsplash.com/photo-1570197788417-0e2238d68385?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ic_2", name: "Strawberry", description: "Pink velvet creamy ice cream folded with organic Mahabaleshwar strawberry jam flakes.", price: 89, category: "Ice Cream", image: "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ic_3", name: "Butterscotch", description: "Creamy butterscotch milk base swirled with rich brown butter caramel crunch nuggets.", price: 99, category: "Ice Cream", image: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ic_4", name: "Chocolate", description: "Decadent rich dark chocolate cream blended with fine Belgian cacao powder flakes.", price: 99, category: "Ice Cream", image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ic_5", name: "Mango", description: "Golden summer Alphonso mango pulps whipped into chilled rich double cream.", price: 99, category: "Ice Cream", image: "https://images.unsplash.com/photo-1507744922-243d5c074ea3?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ic_6", name: "Pineapple", description: "Yellow tangy pineapple juice chunks folded inside artisanal sweet double cream.", price: 89, category: "Ice Cream", image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        
        // Desserts & Specials (Mastani Desserts)
        { id: "ds_1", name: "Mango Mastani", description: "A luxurious thick mango milkshake topped with fresh mango chunks, premium vanilla ice cream, and dry fruits.", price: 149, category: "Ice Cream", image: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&w=400&q=80", popular: true, special: false, inStock: true },
        { id: "ds_2", name: "Kesar Pista Mastani", description: "Rich saffron-pistachio dessert drink with real kesar strands, pista flakes, and vanilla ice cream scoop.", price: 159, category: "Ice Cream", image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true },
        { id: "ds_3", name: "Dry Fruit Mastani", description: "Royal milkshake loaded with direct-import almonds, cashews, raisins, pistachios, topped with vanilla ice cream.", price: 169, category: "Ice Cream", image: "https://images.unsplash.com/photo-1598679253544-2c97992403af?auto=format&fit=crop&w=400&q=80", popular: false, special: false, inStock: true }
      ];
      this.set(this.KEYS.MENU, initialMenu);
    }

    // 2. Seed Mock Orders
    if (!localStorage.getItem(this.KEYS.ORDERS)) {
      const initialOrders = [
        {
          id: "ORD102",
          items: [
            { name: "Veg Crispy", quantity: 1, price: 179 },
            { name: "Paneer Tikka Masala", quantity: 1, price: 319 }
          ],
          subtotal: 498,
          tax: 39.84,
          serviceCharge: 49.80,
          total: 587.64,
          tableNumber: "5",
          status: "Preparing", // Timeline: Placed -> Accepted -> Preparing -> Ready -> Served
          eta: "8 mins",
          timestamp: "07:15 PM",
          date: new Date().toLocaleDateString(),
          history: [
            { status: "Order Placed", completed: true },
            { status: "Accepted", completed: true },
            { status: "Preparing", completed: true },
            { status: "Ready", completed: false },
            { status: "Served", completed: false }
          ]
        },
        {
          id: "ORD101",
          items: [
            { name: "Chicken Fried Rice", quantity: 2, price: 249 },
            { name: "Chicken Manchurian", quantity: 1, price: 249 },
            { name: "Cold Coffee", quantity: 2, price: 149 }
          ],
          subtotal: 1045,
          tax: 83.60,
          serviceCharge: 104.50,
          total: 1233.10,
          tableNumber: "7",
          status: "Served",
          eta: "0 mins",
          timestamp: "06:40 PM",
          date: new Date().toLocaleDateString(),
          history: [
            { status: "Order Placed", completed: true },
            { status: "Accepted", completed: true },
            { status: "Preparing", completed: true },
            { status: "Ready", completed: true },
            { status: "Served", completed: true }
          ]
        }
      ];
      this.set(this.KEYS.ORDERS, initialOrders);
    }

    // 3. Seed Feedbacks
    if (!localStorage.getItem(this.KEYS.FEEDBACKS)) {
      const initialFeedbacks = [
        {
          id: "FDB-482",
          foodRating: 5,
          serviceRating: 5,
          comments: "The Paneer Tikka Masala was sensational! Service was exceptionally fast. Royal treatment indeed.",
          tableNumber: "7",
          timestamp: "07:05 PM",
          date: new Date().toLocaleDateString()
        },
        {
          id: "FDB-291",
          foodRating: 4,
          serviceRating: 5,
          comments: "Excellent Veg Crispy, but the Fresh Lime Soda was a bit sweet. Overall highly recommended.",
          tableNumber: "3",
          timestamp: "06:12 PM",
          date: new Date().toLocaleDateString()
        }
      ];
      this.set(this.KEYS.FEEDBACKS, initialFeedbacks);
    }
  }

  // GETTERS & SETTERS wrapper helpers
  getMenu() { return this.get(this.KEYS.MENU); }
  saveMenu(menu) { this.set(this.KEYS.MENU, menu); }

  getOrders() { return this.get(this.KEYS.ORDERS); }
  saveOrders(orders) { this.set(this.KEYS.ORDERS, orders); }

  getFeedbacks() { return this.get(this.KEYS.FEEDBACKS); }
  saveFeedbacks(feedbacks) { this.set(this.KEYS.FEEDBACKS, feedbacks); }

   getSession() { return this.get(this.KEYS.SESSION); }
  saveSession(session) { this.set(this.KEYS.SESSION, session); }
  clearSession() { localStorage.removeItem(this.KEYS.SESSION); }

  getTableSessions() { return this.get(this.KEYS.TABLE_SESSIONS) || []; }
  saveTableSessions(sessions) { this.set(this.KEYS.TABLE_SESSIONS, sessions); }
  clearTableSessions() { localStorage.removeItem(this.KEYS.TABLE_SESSIONS); }

  getSharedCarts() { return this.get(this.KEYS.SHARED_CARTS) || []; }
  saveSharedCarts(carts) { this.set(this.KEYS.SHARED_CARTS, carts); }
  clearSharedCarts() { localStorage.removeItem(this.KEYS.SHARED_CARTS); }

  getSessionMembers() { return this.get(this.KEYS.SESSION_MEMBERS) || []; }
  saveSessionMembers(members) { this.set(this.KEYS.SESSION_MEMBERS, members); }
  clearSessionMembers() { localStorage.removeItem(this.KEYS.SESSION_MEMBERS); }
}

window.gpStorage = new GrandPalaceStorage();
