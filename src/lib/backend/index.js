import { createDemoBackend } from './demo.js';
import { createSupabaseBackend } from './supabase.js';

// Supabase when both keys are set. Without them, local development runs the demo with sample data.
// A live build never falls back to demo quietly, because guest details typed there would stay in one
// browser: it needs VITE_DEMO=true, and then shows a warning on every screen.
export function getBackend() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) return createSupabaseBackend(url, key);
  if (import.meta.env.PROD && String(import.meta.env.VITE_DEMO || '').trim() !== 'true') return null;
  return createDemoBackend();
}

export const isPublicDemo = backend => backend?.mode === 'demo' && import.meta.env.PROD;
