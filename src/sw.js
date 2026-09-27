// Template: the build fills in the version and file list (see vite.config.ts).
// Cache-first for the whole app, so it opens with no network. A new build installs
// alongside and takes over once every tab of the old one is closed, so an open tab
// never loses a lazy chunk it hasn't loaded yet.
const CACHE = 'bin-pack-__VERSION__'
const FILES = __FILES__

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))))

self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))),
)

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  // ignoreVary: hosts send Vary: Origin, and the page's crossorigin requests carry an Origin the precache didn't.
  e.respondWith(caches.match(req.mode === 'navigate' ? '/' : req, { ignoreVary: true }).then((hit) => hit ?? fetch(req)))
})
