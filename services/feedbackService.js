/**
 * FeedbackService - Persists guest star ratings and reflections in Supabase.
 * Includes local storage offline fallback modes.
 */
class FeedbackService {
  constructor() {
    this.feedbacksList = [];
    this._lastSync = 0;
    this._syncPromise = null;
    this._cachedLogs = null;
  }

  async submitFeedback(foodRating, serviceRating, comments, tableNumber = "5") {
    this._lastSync = 0; // invalidate cache
    const sessionId = window.cartService.getSessionId();
    if (window.supabaseEnabled) {
      try {
        const newFeedback = {
          table_number: tableNumber,
          food_rating: parseInt(foodRating),
          service_rating: parseInt(serviceRating),
          comments: comments
        };

        if (window.supabaseDbUpgraded && window.supabaseFeedbackHasSessionId) {
          newFeedback.session_id = sessionId || null;
        }

        const { error } = await window.supabaseClient
          .from("feedback")
          .insert([newFeedback]);
        if (error) throw error;
        
        return {
          id: `FDB-${Math.floor(100 + Math.random() * 900)}`,
          foodRating,
          serviceRating,
          comments,
          tableNumber,
          sessionId: sessionId || null
        };
      } catch (e) {
        console.error("Supabase feedback submit error, saving locally:", e);
        return this.submitFeedbackLocally(foodRating, serviceRating, comments, tableNumber);
      }
    } else {
      return this.submitFeedbackLocally(foodRating, serviceRating, comments, tableNumber);
    }
  }

  submitFeedbackLocally(foodRating, serviceRating, comments, tableNumber) {
    this._lastSync = 0; // invalidate cache
    const sessionId = window.cartService.getSessionId();
    this.feedbacksList = window.gpStorage.getFeedbacks() || [];
    const feedback = {
      id: `FDB-${Math.floor(100 + Math.random() * 900)}`,
      foodRating: parseInt(foodRating),
      serviceRating: parseInt(serviceRating),
      comments: comments,
      tableNumber: tableNumber,
      sessionId: sessionId || null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString()
    };

    this.feedbacksList.push(feedback);
    window.gpStorage.saveFeedbacks(this.feedbacksList);
    return feedback;
  }

  async getFeedbackLogs(force = false) {
    const now = Date.now();
    if (!force && this._lastSync && (now - this._lastSync < 2000) && this._cachedLogs) {
      return this._cachedLogs;
    }

    if (this._syncPromise) {
      return this._syncPromise;
    }

    this._syncPromise = (async () => {
      try {
        if (window.supabaseEnabled) {
          try {
            const { data, error } = await window.supabaseClient
              .from("feedback")
              .select("*")
              .order("created_at", { ascending: false });
              
            if (error) throw error;
            
            this._cachedLogs = data.map(f => ({
              id: f.id,
              foodRating: f.food_rating,
              serviceRating: f.service_rating,
              comments: f.comments,
              tableNumber: f.table_number,
              timestamp: new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              date: new Date(f.created_at).toLocaleDateString()
            }));
            this._lastSync = Date.now();
            return this._cachedLogs;
          } catch (e) {
            console.error("Supabase feedback log fetch error, using local fallback:", e);
            this._cachedLogs = window.gpStorage.getFeedbacks() || [];
            this._lastSync = Date.now();
            return this._cachedLogs;
          }
        } else {
          this._cachedLogs = window.gpStorage.getFeedbacks() || [];
          this._lastSync = Date.now();
          return this._cachedLogs;
        }
      } finally {
        this._syncPromise = null;
      }
    })();

    return this._syncPromise;
  }
}

window.feedbackService = new FeedbackService();
