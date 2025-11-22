const CACHE_NAME = "djpult-cache-v1";

const MUSIC_FILES = [
  "16_FUN.flac",
  "All The Small Things.flac",
  "Alors On Dance_OPP.flac",
  "Another One Bites The Dust_OPP.mp3",
  "Axel F.flac",
  "Bassdrum_BLOCK.mp3",
  "Bla Bla Bla_HIT.mp3",
  "Boadicea.flac",
  "Breaking Free_HIT.mp3",
  "Der Zug hat keine Bremsen_HIT.mp3",
  "Die Maus_FUN.flac",
  "Disco Pogo_BLOCK.flac",
  "Drop That Low_ACE.mp3",
  "Far Away_OPP.mp3",
  "For You.flac",
  "I Like To Move It_HIT.flac",
  "Im An Albatraoz.mp3",
  "Im Good.mp3",
  "Insomnia.flac",
  "Jump Around_BLOCK.mp3",
  "King Kong_HIT.mp3",
  "L Amour Toujours_HIT.mp3",
  "Late Checkout.flac",
  "Lebenslang.mp3",
  "Like A G6.flac",
  "Lost In Love.mp3",
  "Major Tom_ACE.mp3",
  "Mein Block_BLOCK.flac",
  "Mood_OPP.mp3",
  "Narcotic.mp3",
  "Played A Live.mp3",
  "Poker Face_BLOCK.flac",
  "Resurrection.mp3",
  "Rockstar.flac",
  "Samba De Janeiro_BLOCK.flac",
  "Samsara.flac",
  "Sandstorm_HIT.mp3",
  "Seven Nation Army.mp3",
  "Stay Up_OPP.mp3",
  "Thank You (Not So Bad).flac",
  "The Bad Touch.flac",
  "The Way I Are.flac",
  "TNT _BLOCK.mp3",
  "Tsunami_BLOCK.mp3",
  "Wackelkontakt_FUN.flac",
  "Weekend_OPP.mp3",
  "Who Let The Dogs Out_HIT.flac",
  "Wir haben Spa\u00df und ihr nicht_FUN.flac",
];

const SPECIAL_FILES = [
  "static/special_music/Timeout.mp3",
  "static/special_music/Walk-On.mp3",
  "static/special_music/Ma Ch\u00e8rie.flac",
  "static/special_music/Blue.flac",
];

const ASSETS = [
  "./",
  "./index.html",
  "./script.js",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  ...MUSIC_FILES.map((file) => `static/music/${file}`),
  ...SPECIAL_FILES,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      });
    })
  );
});
