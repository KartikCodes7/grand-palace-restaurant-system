/**
 * RecommendationService - Orchestrates luxury AI recommendations and heuristic fine-dining combos.
 * Connected directly with stock availability to only suggest active dishes.
 */
class RecommendationService {
  constructor() {
    this.pairings = {
      st_1: ["bv_1", "st_7"],
      st_2: ["bv_1", "st_4"],
      st_3: ["bv_2", "st_8"],
      st_4: ["bv_1", "ch_1"],
      st_5: ["bv_2", "ch_2"],
      st_6: ["bv_1", "st_1"],
      st_7: ["bv_1", "st_2"],
      st_8: ["bv_2", "st_3"],

      mc_1: ["mc_8", "mc_7"],
      mc_2: ["mc_8", "st_1"],
      mc_3: ["mc_9", "st_2"],
      mc_4: ["mc_8", "mc_7"],
      mc_5: ["mc_8", "st_7"],
      mc_6: ["mc_8", "mc_3"],
      mc_7: ["mc_8", "mc_4"],
      mc_8: ["mc_4", "mc_7"],
      mc_9: ["mc_1", "mc_6"],

      ch_1: ["st_4", "bv_1"],
      ch_2: ["st_5", "bv_2"],
      ch_3: ["st_1", "bv_1"],
      ch_4: ["st_3", "bv_2"],
      ch_5: ["st_4", "bv_1"],
      ch_6: ["st_5", "bv_2"],
      ch_7: ["st_1", "bv_1"],
      ch_8: ["st_3", "bv_2"],
    };
  }

  /**
   * Fetches personalized AI-recommended items based on active preferences.
   * Filters out any out-of-stock selections.
   */
  async getPersonalizedRecommendations(menuCatalog, categoryPreference = "All", cartItems = {}) {
    return new Promise((resolve) => {
      setTimeout(() => {
        let candidates = [];

        // Check if cart has spicy items to prioritize Fresh Lime Soda & Mango Mastani
        const itemIds = Object.keys(cartItems || {});
        const spicyKeywords = ["masala", "chilli", "kolhapuri", "schezwan", "spicy", "crispy", "tadka", "dragon", "chili", "fiery"];
        let hasSpicy = false;
        for (const id of itemIds) {
          const item = menuCatalog.find(m => m.id === id);
          if (item) {
            const nameLower = item.name.toLowerCase();
            const descLower = (item.description || "").toLowerCase();
            if (spicyKeywords.some(keyword => nameLower.includes(keyword) || descLower.includes(keyword))) {
              hasSpicy = true;
              break;
            }
          }
        }

        if (hasSpicy) {
          // Prepend Fresh Lime Soda (bv_1) and Mango Mastani (ds_1) as priority suggestions
          const cooling = menuCatalog.filter(item => (item.id === "bv_1" || item.id === "ds_1") && item.inStock !== false);
          candidates = [...cooling];
        }
        
        if (categoryPreference !== "All") {
          candidates = [...candidates, ...menuCatalog.filter(item => item.category === categoryPreference)];
        }
        
        if (candidates.length < 3) {
          const populars = menuCatalog.filter(item => item.popular || item.special);
          candidates = [...candidates, ...populars];
        }

        // Filter out-of-stock items and de-duplicate candidates
        const activeCandidates = candidates.filter(item => item.inStock !== false);
        const uniqueCandidates = Array.from(new Set(activeCandidates.map(c => c.id)))
          .map(id => activeCandidates.find(c => c.id === id));

        resolve(uniqueCandidates.slice(0, 4));
      }, 50);
    });
  }

  /**
   * Evaluates active cart item names/descriptions for spicy keywords and suggests Fresh Lime Soda & Mango Mastani.
   */
  async getSpicySuggestions(menuCatalog, cartItems) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const itemIds = Object.keys(cartItems || {});
        if (itemIds.length === 0) {
          resolve(null);
          return;
        }

        const spicyKeywords = ["masala", "chilli", "kolhapuri", "schezwan", "spicy", "crispy", "tadka", "dragon", "chili", "fiery"];
        let hasSpicy = false;
        let spicyItemName = "";

        for (const id of itemIds) {
          const item = menuCatalog.find(m => m.id === id);
          if (item) {
            const nameLower = item.name.toLowerCase();
            const descLower = (item.description || "").toLowerCase();
            if (spicyKeywords.some(keyword => nameLower.includes(keyword) || descLower.includes(keyword))) {
              hasSpicy = true;
              spicyItemName = item.name;
              break;
            }
          }
        }

        if (hasSpicy) {
          const limeSoda = menuCatalog.find(item => item.id === "bv_1" && item.inStock !== false);
          const mangoMastani = menuCatalog.find(item => item.id === "ds_1" && item.inStock !== false);
          
          if (limeSoda || mangoMastani) {
            resolve({
              spicyItem: spicyItemName,
              recommendations: [limeSoda, mangoMastani].filter(Boolean)
            });
            return;
          }
        }

        resolve(null);
      }, 30);
    });
  }

  /**
   * Identifies related items that are frequently ordered with the selected item.
   * Excludes items currently out of stock.
   */
  async getFrequentlyBoughtTogether(menuCatalog, itemId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const pairedIds = this.pairings[itemId] || ["bv_1", "bv_2"];
        const recommended = menuCatalog.filter(item => pairedIds.includes(item.id) && item.inStock !== false);
        resolve(recommended);
      }, 30);
    });
  }

  /**
   * Evaluates current cart content to suggest discount-eligible combos.
   * Guarantees target items are active and in stock.
   */
  async getSmartCombos(menuCatalog, cartItems) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const itemIds = Object.keys(cartItems);
        if (itemIds.length === 0) {
          resolve(null);
          return;
        }

        const hasMainCourse = itemIds.some(id => id.startsWith("mc_"));
        const hasChinese = itemIds.some(id => id.startsWith("ch_"));
        const hasRiceOrStarch = itemIds.includes("mc_8") || itemIds.includes("mc_9");
        const hasStarter = itemIds.some(id => id.startsWith("st_"));
        const hasBeverage = itemIds.some(id => id.startsWith("bv_"));

        // Case 1: Has Main Course but no Rice / Starch -> Suggest "Royal Rice Combo"
        if (hasMainCourse && !hasRiceOrStarch) {
          const riceItem = menuCatalog.find(item => item.id === "mc_8" && item.inStock !== false); // Jeera Rice
          if (riceItem) {
            resolve({
              type: "rice_combo",
              title: "Royal Rice Combo Upgrade",
              description: "Complete your main course with our aromatic Ghee Jeera Rice for an exclusive combo discount.",
              targetItemId: "mc_8",
              originalPrice: 149,
              comboPrice: 119,
              savings: 30,
              badge: "COMBO SAVINGS"
            });
            return;
          }
        }

        // Case 2: Has Chinese Entree but no Chinese Starter -> Suggest "Indo-Chinese Feast Combo"
        if (hasChinese && !hasStarter) {
          const starterItem = menuCatalog.find(item => item.id === "st_1" && item.inStock !== false); // Veg Crispy
          if (starterItem) {
            resolve({
              type: "chinese_combo",
              title: "Indo-Chinese Feast Upgrade",
              description: "Pair your savory noodles/rice with our crispy glazed Veg Crispy for a royal imperial feast.",
              targetItemId: "st_1",
              originalPrice: 179,
              comboPrice: 149,
              savings: 30,
              badge: "FEAST COMBO"
            });
            return;
          }
        }

        // Case 3: Has Main Course + Rice already but no Beverage -> Suggest "Royal Hydration Upgrade"
        if (hasMainCourse && hasRiceOrStarch && !hasBeverage) {
          const bevItem = menuCatalog.find(item => item.id === "bv_1" && item.inStock !== false); // Fresh Lime Soda
          if (bevItem) {
            resolve({
              type: "hydration_combo",
              title: "Palatial Hydration Upgrade",
              description: "Cleanse your palate with our hand-squeezed chilled Fresh Lime Soda at a special upgrade price.",
              targetItemId: "bv_1",
              originalPrice: 89,
              comboPrice: 59,
              savings: 30,
              badge: "ROYAL COMBO"
            });
            return;
          }
        }

        resolve(null);
      }, 40);
    });
  }

  /**
   * Suggests refreshing desserts and gourmet beverages if cart total exceeds ₹500.
   * Guarantees suggested desserts are active and in stock.
   */
  async getDessertRecommendations(menuCatalog, cartTotal) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (cartTotal <= 500) {
          resolve([]);
          return;
        }

        const sweetOptions = menuCatalog.filter(item => (item.category === "Ice Cream" || item.id === "bv_2") && item.inStock !== false);
        
        const choices = [
          sweetOptions.find(item => item.id === "ic_4"), // Chocolate
          sweetOptions.find(item => item.id === "ic_5"), // Mango
          sweetOptions.find(item => item.id === "bv_2"), // Cold Coffee
        ].filter(Boolean);

        resolve(choices.slice(0, 3));
      }, 30);
    });
  }
}

window.recommendationService = new RecommendationService();
