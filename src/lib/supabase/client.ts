import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://wertmoquxdrucdbobuie.supabase.co';

export function getStoredAnonKey(): string {
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envKey && envKey.trim() !== '') return envKey.trim();

  const localKey = localStorage.getItem('optmapay_supabase_anon_key');
  return localKey || '';
}

export function setStoredAnonKey(key: string): void {
  localStorage.setItem('optmapay_supabase_anon_key', key.trim());
}

let supabaseInstance: SupabaseClient | null = null;
let currentKeyUsed: string | null = null;

export function getSupabaseClient(): SupabaseClient {
  const anonKey = getStoredAnonKey();
  const validKey = anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_offline';

  if (!supabaseInstance || currentKeyUsed !== validKey) {
    currentKeyUsed = validKey;
    supabaseInstance = createClient(DEFAULT_SUPABASE_URL, validKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return supabaseInstance;
}

export function resetSupabaseClient(newAnonKey: string): SupabaseClient {
  setStoredAnonKey(newAnonKey);
  currentKeyUsed = newAnonKey.trim();
  supabaseInstance = createClient(DEFAULT_SUPABASE_URL, newAnonKey.trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return supabaseInstance;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

