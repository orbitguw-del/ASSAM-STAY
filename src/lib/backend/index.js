import { createDemoBackend } from './demo.js';
import { createSupabaseBackend } from './supabase.js';

// Supabase when both keys are set in .env; otherwise demo mode with sample data in this browser.
export function getBackend() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? createSupabaseBackend(url, key) : createDemoBackend();
}
