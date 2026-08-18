/* Service worker: offline + actualización automática (network-first para el código). */
const CACHE = 'presupuesto-v3';
const ASSETS = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  const isShell = e.request.mode==='navigate' || url.pathname.endsWith('/') || /\.(html|js|webmanifest)$/.test(url.pathname);
  if(isShell){
    // Network-first: siempre intenta traer la versión más nueva; si no hay red, usa la caché.
    e.respondWith(
      fetch(e.request).then(res=>{ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}); return res; })
        .catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
    );
  } else {
    // Cache-first para estáticos (ícono).
    e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));
  }
});
