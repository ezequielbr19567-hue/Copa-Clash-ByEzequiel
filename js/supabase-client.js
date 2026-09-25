

const config = window.CLASH_CONFIG || {};
export const configured = Boolean(
  config.SUPABASE_URL &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_URL.includes('https://jzgsamwvvhqvynyzvuiw.supabase.co') &&
  !config.SUPABASE_ANON_KEY.includes('sb_publishable_-e3Cx7ypXdLCX79z6cjTGA_pTBS4E-5')
);

export let supabase = null;
if (configured) {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (error) { console.error('Falha ao conectar.', error); }
}
