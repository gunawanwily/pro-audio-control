(() => {
  let deferredPrompt = null;
  const installBtn = document.getElementById('pwaInstallBtn');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || window.navigator.standalone === true;
  const ua = navigator.userAgent || '';
  const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua);

  document.documentElement.classList.toggle('electron-mode', !!window.electronAPI);
  document.documentElement.classList.toggle('web-mode', !window.electronAPI);
  document.documentElement.classList.toggle('pwa-standalone', standalone);
  document.documentElement.dataset.platform = isiOS ? 'ios' : isAndroid ? 'android' : isWindows ? 'windows' : isMac ? 'macos' : 'web';

  function setInstallVisible(show) {
    if (!installBtn) return;
    // Electron/standalone apps do not need an install control.
    const visible = !standalone && !window.electronAPI && show;
    installBtn.hidden = !visible;
    installBtn.setAttribute('aria-hidden', String(!visible));
  }

  function iosHelp() {
    alert('Pasang PRO AUDIO CONTROL di iPhone/iPad:\n\n1. Buka aplikasi ini melalui Safari dan pastikan alamat menggunakan HTTPS.\n2. Tekan tombol Bagikan (Share).\n3. Pilih “Add to Home Screen / Tambahkan ke Layar Utama”.\n4. Tekan Add/Tambahkan.\n\nSetelah itu aplikasi dapat dibuka dari ikon seperti aplikasi biasa.');
  }

  function genericHelp() {
    const browser = isAndroid ? 'Chrome Android' : (isWindows || isMac ? 'Chrome/Edge' : 'browser yang mendukung PWA');
    alert('Untuk memasang PRO AUDIO CONTROL:\n\n• Buka versi HTTPS aplikasi.\n• Pada ' + browser + ', buka menu Install app / Add to Home screen.\n• Setelah terpasang, jalankan dari ikon aplikasi agar tampil tanpa address bar.');
  }

  setInstallVisible(!standalone);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    setInstallVisible(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallVisible(false);
  });

  installBtn?.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
      return;
    }
    if (isiOS) {
      iosHelp();
    } else {
      genericHelp();
    }
  });

  // PWA service worker requires HTTPS (or localhost/127.0.0.1 for testing).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', {scope:'./'})
        .then(reg => {
          // Prompt the page to update when a new service worker is waiting.
          if (reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                installing.postMessage({type:'SKIP_WAITING'});
              }
            });
          });
        })
        .catch(err => console.warn('PWA service worker:', err));
    });
  }
})();
