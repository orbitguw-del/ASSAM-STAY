// Live backend: Supabase Postgres with row-level security doing the tenant isolation.
import { createClient } from '@supabase/supabase-js';

export function createSupabaseBackend(url, anonKey) {
  const sb = createClient(url, anonKey);
  const unwrap = ({ data, error }) => {
    if (error) { const e = new Error(error.message); e.code = error.code; e.details = error.details; throw e; }
    return data;
  };

  return {
    mode: 'supabase',
    client: sb,
    async init() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { user: null };
      return { user: session.user, staffName: session.user.user_metadata?.full_name || session.user.email };
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') cb(); });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email) {
      unwrap(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } }));
    },
    async signOut() { await sb.auth.signOut(); },
    async listProperties() { return unwrap(await sb.from('properties').select('*').order('created_at')); },
    async getRules() { return unwrap(await sb.from('rules').select('*')); },
    async select(table, match = {}) { return unwrap(await sb.from(table).select('*').match(match).limit(5000)); },
    async insert(table, row) { return unwrap(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) { return unwrap(await sb.from(table).update(patch).eq('id', id).select().single()); },
    async rpc(name, args) { return unwrap(await sb.rpc(name, args)); },
  };
}
