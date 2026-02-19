/* Quote App PWA controller: register/unregister SW from server config. */
(function () {
  const PWA_CACHE_PREFIX = 'quote-app-';

  function supportsPwa() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator;
  }

  async function clearPwaCaches() {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(PWA_CACHE_PREFIX))
        .map((key) => caches.delete(key))
    );
  }

  async function unregisterServiceWorkers() {
    if (!supportsPwa()) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  async function configurePwa(config) {
    const enabled = !!(config && config.enabled);
    if (!supportsPwa()) return;

    if (enabled) {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        registration.update().catch(() => {});
      } catch (err) {
        console.warn('PWA service worker registration failed', err);
      }
      return;
    }

    try {
      await unregisterServiceWorkers();
      await clearPwaCaches();
    } catch (err) {
      console.warn('PWA kill-switch cleanup failed', err);
    }
  }

  window.__quoteAppConfigurePwa = configurePwa;

  if (window.__quoteAppPendingPwaConfig) {
    const pendingConfig = window.__quoteAppPendingPwaConfig;
    delete window.__quoteAppPendingPwaConfig;
    configurePwa(pendingConfig);
  }
})();
