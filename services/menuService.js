/**
 * MenuService - Coordinates the fine-dining menu catalog.
 * Supports live Supabase queries and transparent offline localStorage fallbacks.
 */
class MenuService {
  constructor() {
    this.menuCatalog = [];
    this._lastSync = 0;
    this._syncPromise = null;
  }

  /**
   * Automatically assigns a premium category-specific food photography fallback if the image is missing or empty.
   */
  ensurePremiumImage(image, category) {
    if (!image || typeof image !== "string" || image.trim() === "" || image.includes("placeholder")) {
      const fallbacks = {
        "Starters": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=400&q=80",
        "Main Course": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=400&q=80",
        "Chinese Khajana": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=400&q=80",
        "Beverages": "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=400&q=80",
        "Ice Cream": "https://images.unsplash.com/photo-1570197788417-0e2238d68385?auto=format&fit=crop&w=400&q=80"
      };
      return fallbacks[category] || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80";
    }
    return image;
  }

  /**
   * Syncs internal catalog cache from database or local fallback with request deduplication
   */
  async syncCatalog(force = false) {
    const now = Date.now();
    if (!force && this._lastSync && (now - this._lastSync < 30000) && this.menuCatalog && this.menuCatalog.length > 0) {
      return this.menuCatalog;
    }

    if (this._syncPromise) {
      return this._syncPromise;
    }

    this._syncPromise = (async () => {
      try {
        if (window.supabaseEnabled) {
          try {
            const { data, error } = await window.supabaseClient
              .from("menu_items")
              // Using select(*) because the column naming is uncertain (snake_case vs camelCase) 
              // and the menu table is small (~30 rows).
              .select("*")
              .order("id");
              
            if (error) throw error;
            
            // Map database snake_case fields to client-side camelCase properties
            this.menuCatalog = data.map(item => {
              const category = item.category || "Starters";
              return {
                id: item.id,
                name: item.name,
                description: item.description,
                price: Number(item.price),
                category: category,
                image: this.ensurePremiumImage(item.image, category),
                popular: item.popular,
                special: item.special,
                inStock: item.in_stock !== false
              };
            });
            this._lastSync = Date.now();
          } catch (e) {
            console.error("Supabase menu sync error, utilizing local storage:", e);
            this.menuCatalog = (window.gpStorage.getMenu() || []).map(item => {
              const category = item.category || "Starters";
              return {
                ...item,
                image: this.ensurePremiumImage(item.image, category)
              };
            });
            this._lastSync = Date.now();
          }
        } else {
          this.menuCatalog = (window.gpStorage.getMenu() || []).map(item => {
            const category = item.category || "Starters";
            return {
              ...item,
              image: this.ensurePremiumImage(item.image, category)
            };
          });
          this._lastSync = Date.now();
        }
        return this.menuCatalog;
      } finally {
        this._syncPromise = null;
      }
    })();

    return this._syncPromise;
  }

  async getMenu(force = false) {
    await this.syncCatalog(force);
    return this.menuCatalog;
  }

  async getPopularDishes(force = false) {
    await this.syncCatalog(force);
    return this.menuCatalog.filter(item => item.popular && item.inStock);
  }

  async getTodaysSpecial(force = false) {
    await this.syncCatalog(force);
    return this.menuCatalog.find(item => item.special && item.inStock) || this.menuCatalog[0];
  }

  /**
   * Owner stock control updates
   */
  async toggleAvailability(itemId) {
    await this.syncCatalog(true);
    const item = this.menuCatalog.find(m => m.id === itemId);
    if (!item) return;

    const nextState = !item.inStock;

    if (window.supabaseEnabled) {
      try {
        const { error } = await window.supabaseClient
          .from("menu_items")
          .update({ in_stock: nextState })
          .eq("id", itemId);
        if (error) throw error;
      } catch (e) {
        console.error("Supabase stock update error, saving locally:", e);
        window.gpStorage.saveMenu(
          this.menuCatalog.map(m => m.id === itemId ? { ...m, inStock: nextState } : m)
        );
      }
    } else {
      window.gpStorage.saveMenu(
        this.menuCatalog.map(m => m.id === itemId ? { ...m, inStock: nextState } : m)
      );
    }
    return this.getMenu(true);
  }

  async togglePopular(itemId) {
    await this.syncCatalog(true);
    const item = this.menuCatalog.find(m => m.id === itemId);
    if (!item) return;

    const nextState = !item.popular;

    if (window.supabaseEnabled) {
      try {
        const { error } = await window.supabaseClient
          .from("menu_items")
          .update({ popular: nextState })
          .eq("id", itemId);
        if (error) throw error;
      } catch (e) {
        console.error("Supabase popularity update error, saving locally:", e);
        window.gpStorage.saveMenu(
          this.menuCatalog.map(m => m.id === itemId ? { ...m, popular: nextState } : m)
        );
      }
    } else {
      window.gpStorage.saveMenu(
        this.menuCatalog.map(m => m.id === itemId ? { ...m, popular: nextState } : m)
      );
    }
    return this.getMenu(true);
  }

  async setTodaysSpecial(itemId) {
    await this.syncCatalog(true);
    
    if (window.supabaseEnabled) {
      try {
        // Reset all other specials
        await window.supabaseClient
          .from("menu_items")
          .update({ special: false })
          .neq("id", itemId);

        // Set target special
        const { error } = await window.supabaseClient
          .from("menu_items")
          .update({ special: true })
          .eq("id", itemId);
        if (error) throw error;
      } catch (e) {
        console.error("Supabase special update error, saving locally:", e);
        window.gpStorage.saveMenu(
          this.menuCatalog.map(m => m.id === itemId ? { ...m, special: true } : { ...m, special: false })
        );
      }
    } else {
      window.gpStorage.saveMenu(
        this.menuCatalog.map(m => m.id === itemId ? { ...m, special: true } : { ...m, special: false })
      );
    }
    return this.getMenu(true);
  }
}

window.menuService = new MenuService();
