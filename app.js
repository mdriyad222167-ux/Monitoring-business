/* app.js — router, startup, service worker. */
(function () {
  'use strict';
  const { $, $$, toast } = MZ.UI;
  const routes = {
    dashboard: MZ.Views.dashboard, sales: MZ.Views.sales, inventory: MZ.Views.inventory,
    customers: MZ.Views.customers, expenses: MZ.Views.expenses, reports: MZ.Views.reports, backup: MZ.Views.backup,
  };

  async function route() {
    const name = (location.hash.replace(/^#\//, '').split('?')[0]) || 'dashboard';
    const fn = routes[name] || routes.dashboard;
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === (routes[name] ? name : 'dashboard')));
    const view = $('#view');
    try {
      await fn(view);
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="err">Could not load this screen: ' + MZ.U.esc(e.message || e) + '</div>';
    }
    window.scrollTo(0, 0);
  }
  MZ.refresh = route;

  function netState() {
    const el = $('#netstate');
    el.textContent = navigator.onLine ? 'Works offline' : 'Offline';
  }

  async function start() {
    try {
      await MZ.DB.open();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      $('#view').innerHTML = '<div class="err">' + MZ.U.esc(e.message || e) + '</div>';
      return;
    }
    window.addEventListener('hashchange', route);
    window.addEventListener('online', netState); window.addEventListener('offline', netState);
    netState();
    await route();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
    }
  }
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast('Unexpected error: ' + ((e.reason && e.reason.message) || e.reason), true); });
  start();
})();
