window.installAuraAutoNavigation = function (applySidebar) {
  const app = document.getElementById('app'), sidebar = app.querySelector('.sidebar');
  if (sidebar.dataset.autoNavigation) return;
  sidebar.dataset.autoNavigation = 'true';
  const close = () => { app.classList.remove('sidebar-peek'); applySidebar(true); };
  const peek = () => {
    if (app.classList.contains('sidebar-collapsed')) app.classList.add('sidebar-peek');
    document.getElementById('sidebar-toggle').setAttribute('aria-expanded', 'true');
    document.getElementById('sidebar-toggle').setAttribute('aria-label', 'Replegar barra lateral');
  };
  sidebar.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') peek(); });
  sidebar.addEventListener('pointerleave', close);
  sidebar.addEventListener('focusin', event => { if (event.target.id !== 'sidebar-toggle') peek(); });
  sidebar.addEventListener('focusout', event => { if (!sidebar.contains(event.relatedTarget)) close(); });
  sidebar.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('pointerdown', event => { if (!sidebar.contains(event.target)) close(); });
  sidebar.querySelectorAll('.sidebar-section').forEach((heading, index) => {
    const items = []; let next = heading.nextElementSibling;
    while (next?.classList.contains('nav-item')) { items.push(next); next = next.nextElementSibling; }
    if (!items.length) return;
    const group = document.createElement('div'); group.className = 'aura-nav-group';
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'sidebar-section aura-group-toggle'; button.textContent = heading.textContent;
    if (heading.dataset.auraApp) button.dataset.auraApp = heading.dataset.auraApp;
    const content = document.createElement('div'); content.id = `aura-nav-group-${index}`; content.className = 'aura-group-items';
    button.setAttribute('aria-controls', content.id); button.setAttribute('aria-expanded', 'false');
    heading.before(group); group.append(button, content); items.forEach(item => content.append(item)); heading.remove();
    button.addEventListener('click', () => {
      const opening = group.dataset.open !== 'true';
      sidebar.querySelectorAll('.aura-nav-group').forEach(other => {
        other.dataset.open = 'false'; other.querySelector('button').setAttribute('aria-expanded', 'false');
      });
      group.dataset.open = String(opening); button.setAttribute('aria-expanded', String(opening));
    });
  });
  sidebar.querySelectorAll('.nav-item').forEach(link => {
    link.setAttribute('aria-label', link.querySelector('.nav-label')?.textContent || link.textContent.trim()); link.tabIndex = 0;
    link.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); link.click(); } });
    link.addEventListener('click', () => {
      sidebar.querySelectorAll('.aura-nav-group').forEach(group => {
        group.dataset.open = 'false'; group.querySelector('button').setAttribute('aria-expanded', 'false');
      }); close();
    });
  });
};
