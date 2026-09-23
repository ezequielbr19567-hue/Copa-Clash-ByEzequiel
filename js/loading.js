// Independent of the remote SDK: a failed import must never trap the visitor.
try {
  const saved = JSON.parse(localStorage.getItem('arena-appearance') || '{}');
  const loader = document.querySelector('#pageLoader');
  if (typeof saved.loading_text === 'string') loader.querySelector('[data-setting]').textContent = saved.loading_text;
  if (/^#[0-9a-f]{6}$/i.test(saved.accent_color)) document.documentElement.style.setProperty('--accent', saved.accent_color);
  if (typeof saved.image_url === 'string' && (saved.image_url === 'assets/site-image.png' || new URL(saved.image_url).protocol === 'https:')) {
    const img = loader.querySelector('img');
    img.onerror = () => { img.onerror = null; img.src = 'assets/site-image.png'; };
    img.src = saved.image_url;
  }
} catch {}
window.finishLoading = () => {
  document.querySelector('#pageLoader')?.remove();
  document.querySelector('main')?.removeAttribute('aria-busy');
};
window.loadingTimeout = setTimeout(() => {
  window.finishLoading();
  const status = document.querySelector('#setupWarning');
  if (status) {
    status.textContent = 'Não foi possível carregar. Tente atualizar a página.';
    status.classList.remove('hidden');
  }
  const root = document.querySelector('#adminRoot');
  if (root && !root.querySelector('form,.admin-shell,.login-card')) root.innerHTML = '<p class="empty">Não foi possível conectar. Atualize a página para tentar novamente.</p>';
}, 12000);
