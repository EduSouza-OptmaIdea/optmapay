import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

const DEFAULT_SUPABASE_URL = 'https://wertmoquxdrucdbobuie.supabase.co';
const DEFAULT_FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlcnRtb3F1eGRydWNkYm9idWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODQ5MDIsImV4cCI6MjEwMzM2MDkwMn0.KPlRj0w9wwO2Jf3rySQEfvqsx6wadqaUxftlhNX0p6A';

import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filename: string) {
  try {
    const filePath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          if (typeof process !== 'undefined' && process.env && !process.env[k]) {
            process.env[k] = v;
          }
        }
      }
    }
  } catch {}
}

function getEnvVar(key: string): string | undefined {
  try {
    const envObj = (typeof process !== 'undefined' ? (process as any).env : {}) || {};
    if (envObj[key]) return envObj[key];
    loadEnvFile('.env.local');
    loadEnvFile('.env');
    return (typeof process !== 'undefined' ? (process as any).env : {})[key];
  } catch {
    return undefined;
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const supabaseUrl =
    getEnvVar('SUPABASE_URL') ||
    getEnvVar('VITE_SUPABASE_URL');

  const serviceRoleKey =
    getEnvVar('SUPABASE_SERVICE_ROLE_KEY') ||
    getEnvVar('SUPABASE_SERVICE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'CONFIG_ERROR: getSupabaseAdmin() requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set. Fallback to anon key is strictly prohibited.'
    );
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

export function getSupabaseUserClient(token: string): SupabaseClient {
  const supabaseUrl =
    getEnvVar('SUPABASE_URL') ||
    getEnvVar('VITE_SUPABASE_URL') ||
    DEFAULT_SUPABASE_URL;

  const anonKey =
    getEnvVar('VITE_SUPABASE_ANON_KEY') ||
    DEFAULT_FALLBACK_KEY;

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
