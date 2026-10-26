// Service worker: makes the app installable, keeps it working offline, and
// receives chats from the Android share sheet (Web Share Target).
// A shared chat is handed to the page through Cache Storage on this device;
// it is never sent to the server.

const SHELL = "shell-v1";
const SHARED = "shared-chat";
const SHARE_PATH = "/share-target";
const SHELL_FILES = [
  "/", "/style.css", "/icon.svg", "/manifest.webmanifest",
  "/js/app.js", "/js/ai.js", "/js/analyze.worker.js", "/js/dashboard.js", "/js/demo.js", "/js/dom.js",
  "/js/format.js", "/js/parse.js", "/js/payload.js", "/js/share.js", "/js/stats.js", "/js/story.js", "/js/zip.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== SHARED) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const file = form.getAll("chat").find((f) => f instanceof File && f.size > 0);
    if (!file) return Response.redirect("/?shared=empty", 303);
    const cache = await caches.open(SHARED);
    await cache.put("/shared/latest", new Response(file, {
      headers: { "Content-Type": file.type || "application/octet-stream", "X-Filename": encodeURIComponent(file.name || "chat.txt") },
    }));
    return Response.redirect("/?shared=1", 303);
  } catch {
    return Response.redirect("/?shared=error", 303);
  }
}

// Network first so a deploy is picked up immediately; the cache is only an offline fallback.
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    return cached ?? (request.mode === "navigate" ? cache.match("/") : Response.error());
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === "POST" && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  event.respondWith(networkFirst(event.request));
});
