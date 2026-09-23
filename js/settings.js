export const defaults = {
  site_name: 'Arena', hero_title: 'Copa', hero_description: '',
  cup_title: 'Copa', groups_title: 'Fase de grupos', bracket_title: 'Mata-mata', matches_title: 'Partidas',
  footer_text: '', image_url: 'assets/site-image.png', accent_color: '#ffca45', primary_color: '#1769c2',
  cta_label: 'Ver partidas', participants_label: 'Participantes', groups_label: 'Grupos', scheduled_label: 'Agendadas', finished_label: 'Finalizadas',
  empty_groups: 'Configure os grupos e adicione participantes para começar.', empty_cup: 'Nenhum confronto de mata-mata cadastrado.', empty_matches: 'Nenhuma partida cadastrada.',
  loading_text: 'Carregando', show_hero: true
};
export function imageUrl(value) {
  if (value === defaults.image_url) return value;
  try { const url = new URL(value); if (url.protocol === 'https:') return url.href; } catch {}
  return defaults.image_url;
}
export function normalizeSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (typeof value[key] === typeof defaults[key]) result[key] = value[key];
  }
  result.image_url = imageUrl(result.image_url);
  if (!/^#[0-9a-f]{6}$/i.test(result.accent_color)) result.accent_color = defaults.accent_color;
  if (!/^#[0-9a-f]{6}$/i.test(result.primary_color)) result.primary_color = defaults.primary_color;
  return result;
}
export function applySettings(settings) {
  try { localStorage.setItem('arena-appearance', JSON.stringify(settings)); } catch {}
  document.title = document.body.classList.contains('admin-body') ? `Admin · ${settings.site_name || 'Arena'}` : settings.site_name || 'Arena';
  document.documentElement.style.setProperty('--accent', settings.accent_color);
  document.documentElement.style.setProperty('--royal', settings.primary_color);
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = settings.primary_color;
  document.querySelectorAll('[data-setting]').forEach(el => {
    el.textContent = settings[el.dataset.setting] ?? '';
    el.hidden = !el.textContent;
  });
  document.querySelectorAll('[data-site-image]').forEach(el => {
    el.onerror = () => { el.onerror = null; el.src = defaults.image_url; };
    el.src = settings.image_url;
  });
  document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]').forEach(el => el.href = settings.image_url);
  const cta = document.querySelector('.hero-cta');
  if(cta) cta.hidden = !settings.cta_label;
  const hero = document.querySelector('#inicio');
  if (hero) hero.hidden = !settings.show_hero;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = settings.hero_description;
}
