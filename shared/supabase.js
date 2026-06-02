/**
 * shared/supabase.js - Initializes the Supabase client.
 * Includes an automatic offline fallback system. If you haven't set your actual Supabase URL
 * and Anon Key below, it gracefully routes all calls to gpStorage for local mock sync.
 */

// 1. INPUT YOUR SUPABASE CREDS HERE:
const SUPABASE_URL = "https://nqzstyshjekndrvdezqf.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_2yMaCwerCVXgeA9mRuTpfA_JGwNQx1a";

// 2. Client Initialization with Fallback Guards
let gpSupabase = null;
let enabled = false;

const isPlaceholder = 
  SUPABASE_URL.includes("your-supabase-url") || 
  SUPABASE_ANON_KEY.includes("your-supabase-anon-key") ||
  !SUPABASE_URL.startsWith("https://");

function initSupabase() {
  if (enabled) return true;
  if (isPlaceholder) return false;

  try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      gpSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      enabled = true;
      window.supabaseEnabled = true;
      window.supabaseClient = gpSupabase;
      console.log("👑 Grand Palace Backend: Connected to Supabase Database successfully.");
      return true;
    }
  } catch (e) {
    console.error("❌ Grand Palace Backend: Failed to initialize Supabase client:", e);
  }
  return false;
}

// Try to initialize immediately
initSupabase();

// Also try to initialize when window loads (in case of CDN lag)
window.addEventListener("load", () => {
  if (!enabled) {
    const success = initSupabase();
    if (success && window.onAppStateChanged) {
      window.onAppStateChanged();
    }
  }
});

// Bind to window context
window.supabaseEnabled = enabled;
window.supabaseClient = gpSupabase;
