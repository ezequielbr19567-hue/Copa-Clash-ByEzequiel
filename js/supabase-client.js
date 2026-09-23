const STORAGE_KEY = 'clash-supabase-config-v1';

function cleanConfig(value = {}) {
  const url = String(value?.SUPABASE_URL || '').trim();
  const key = String(value?.SUPABASE_ANON_KEY || '').trim();
  return { SUPABASE_URL:url, SUPABASE_ANON_KEY:key };
}

function isUsable(value = {}) {
  const { SUPABASE_URL:url, SUPABASE_ANON_KEY:key } = cleanConfig(value);
  if (!url || !key || /COLE_AQUI|YOUR_|EXEMPLO/i.test(url + key)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /\.supabase\.co$/i.test(parsed.hostname);
  } catch { return false; }
}

function readStoredConfig() {
  try { return cleanConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  catch { return cleanConfig(); }
}

function persistConfig(value) {
  if (!isUsable(value)) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanConfig(value))); return true; }
  catch { return false; }
}

const fileConfig = cleanConfig(window.CLASH_CONFIG || {});
const storedConfig = readStoredConfig();
const resolvedConfig = isUsable(fileConfig) ? fileConfig : storedConfig;

// Sempre que config.js estiver correto, guardamos uma cópia local. Assim uma atualização
// do site não perde a conexão caso config.js seja publicado com placeholder ou venha de cache.
if (isUsable(fileConfig)) persistConfig(fileConfig);

export const configured = isUsable(resolvedConfig);
export const connectionSource = isUsable(fileConfig) ? 'file' : (isUsable(storedConfig) ? 'browser' : 'none');
export const currentConfig = { ...resolvedConfig };

export function saveSupabaseConfig(url, key) {
  const next = cleanConfig({ SUPABASE_URL:url, SUPABASE_ANON_KEY:key });
  if (!isUsable(next)) throw new Error('Informe uma URL válida do Supabase e a chave pública/publishable.');
  if (!persistConfig(next)) throw new Error('O navegador não permitiu salvar a configuração local.');
  return next;
}

export function clearSavedSupabaseConfig() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export let supabase = null;
export let connectionError = null;
if (configured) {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = createClient(resolvedConfig.SUPABASE_URL, resolvedConfig.SUPABASE_ANON_KEY, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
      global: { headers: { 'x-clash-client':'cup-v3' } }
    });
  } catch (error) {
    connectionError = error;
    console.error('Falha ao carregar o cliente do Supabase.', error);
  }
}
