// Service worker: deixa o app instalável, abre mesmo sem internet
// (mostrando os últimos dados) e recebe os avisos de rua alagada.
const VERSAO = "alagamentos-sp-v2";
const ARQUIVOS = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "data.js",
  "config.js",
  "manifest.json",
  "icones/favicon.svg",
  "icones/icone-192.png",
  "icones/icone-512.png"
];

self.addEventListener("install", evento => {
  evento.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Sempre tenta a internet primeiro (assim nunca fica preso numa versão velha);
// sem internet, usa a cópia guardada.
self.addEventListener("fetch", evento => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  const ehDoApp = url.origin === self.location.origin && !url.pathname.includes("/tiles/");
  const ehDadoUtil = /\/api\/(alagamentos|historico)/.test(url.pathname);
  if (!ehDoApp && !ehDadoUtil) return; // mapas, radar e fontes: direto da internet

  evento.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});

// ---------- Avisos ----------
self.addEventListener("push", evento => {
  let dados = {};
  try { dados = evento.data.json(); } catch { dados = { title: "Alagamentos SP", body: evento.data && evento.data.text() }; }

  evento.waitUntil(self.registration.showNotification(dados.title || "Alagamentos SP", {
    body: dados.body || "",
    tag: dados.tag,
    icon: "icones/icone-192.png",
    badge: "icones/icone-192.png",
    data: { url: dados.url || "./" },
    vibrate: [120, 60, 120]
  }));
});

self.addEventListener("notificationclick", evento => {
  evento.notification.close();
  const destino = new URL(evento.notification.data.url, self.registration.scope).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(janelas => {
      const aberta = janelas.find(j => j.url.startsWith(self.registration.scope));
      if (aberta) return aberta.navigate(destino).then(j => (j || aberta).focus());
      return self.clients.openWindow(destino);
    })
  );
});
