let audioEl = null; // zentrales Audio-Element fuer alle Plattformen
let audioCtx = null; // Web Audio Kontext (fuer iOS/Volume/Fade)
let gainNode = null; // Gain fuer Volume/Fade
let mediaElementSource = null; // MediaElementSource fuer das zentrale Audio
let currentAudio = null;
let volumeLevel = 1.0;
let fadeIntervalId = null;
let nowPlaying = { title: "", duration: 0 };
let nowPlayingEls = { box: null, title: null, eta: null };
const NOW_PLAYING_WARNING_THRESHOLD = 10; // Sekunden
let songPlayCounts = {};
let zoomLevel = 1;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.2;
const ZOOM_STEP = 0.05;
let zoomEls = { level: null, inBtn: null, outBtn: null };

const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Mac") && "ontouchend" in document);

const categories = {
  ass_angriff: { title: "Ass/Angriff", color: "bg-blue-600", baseHSL: [217, 83, 57], items: [] }, // Tailwind blue-600
  block: { title: "Block", color: "bg-pink-600", baseHSL: [336, 81, 62], items: [] }, // Tailwind pink-600
  gegner: { title: "Gegner", color: "bg-red-600", baseHSL: [0, 72, 52], items: [] }, // Tailwind red-600
  sonstiges: { title: "_", color: "bg-green-600", baseHSL: [142, 71, 45], items: [] }, // Tailwind green-600
  noch_mehr: { title: "_", color: "bg-green-600", baseHSL: [142, 71, 45], items: [] }, // Tailwind green-600
  noch_mehr2: { title: "_", color: "bg-green-600", baseHSL: [142, 71, 45], items: [] }, // Tailwind green-600
  spass: { title: "Lustig", color: "bg-purple-600", items: [] },
};

const icons = {
  ass_angriff: "\uD83D\uDD25",
  block: "\uD83E\uDDF1",
  gegner: "\u2694\uFE0F",
  spass: "\uD83C\uDF89",
  sonstiges: "\uD83C\uDFB5",
  noch_mehr: "\uD83C\uDFB5",
  noch_mehr2: "\uD83C\uDFB5",
};

const specialTracks = {
  timeout: null,
  walkon: null,
  pause1: null,
  pause2: null,
};

function cleanName(filename) {
  return filename
    .replace(/_BLOCK/i, "")
    .replace(/_HIT/i, "")
    .replace(/_ACE/i, "")
    .replace(/_OPP/i, "")
    .replace(/_FUN/i, "")
    .replace(/_TIMEOUT/i, "")
    .replace(/_WALKON/i, "")
    .replace(/_PAUSE1/i, "")
    .replace(/_PAUSE2/i, "")
    .replace(/\.(mp3|flac|wav|ogg)$/i, "")
    .trim();
}

function resetCategories() {
  Object.values(categories).forEach((cat) => {
    cat.items = [];
  });
  Object.keys(specialTracks).forEach((k) => {
    specialTracks[k] = null;
  });
}

function handleFiles(fileList) {
  loadPlayCounts();
  resetCategories();
  const files = Array.from(fileList || []);
  let toggle = 0;

  files.forEach((file) => {
    const relPath = file.webkitRelativePath || file.name;
    const isAudio =
      (file.type && file.type.startsWith("audio/")) ||
      /\.(mp3|flac|wav|ogg)$/i.test(file.name);
    if (!isAudio) return;

    const inSpecial = /(^|[\\/])special_music[\\/]/i.test(relPath);
    const upper = file.name.toUpperCase();

    if (inSpecial) {
      let key = null;
      if (upper.includes("_TIMEOUT")) key = "timeout";
      else if (upper.includes("_WALKON")) key = "walkon";
      else if (upper.includes("_PAUSE1")) key = "pause1";
      else if (upper.includes("_PAUSE2")) key = "pause2";

      if (key) {
        specialTracks[key] = {
          name: file.name,
          display: cleanName(file.name),
          url: URL.createObjectURL(file),
        };
      }
      return; // Spezial-Songs nicht in Kategorien einsortieren
    }

    let key;
    if (upper.includes("_HIT") || upper.includes("_ACE")) key = "ass_angriff";
    else if (upper.includes("_BLOCK")) key = "block";
    else if (upper.includes("_OPP")) key = "gegner";
    else if (upper.includes("_FUN")) key = "spass";
    else {
      const miscKeys = ["sonstiges", "noch_mehr", "noch_mehr2"];
      key = miscKeys[toggle % miscKeys.length];
      toggle += 1;
    }

    categories[key].items.push({
      id: file.name, // stabile ID fuer Counter/Storage
      name: file.name,
      display: cleanName(file.name),
      icon: icons[key],
      category: key,
      url: URL.createObjectURL(file),
    });
  });

  renderCategories();
  updateSpecialButtons();
}

function getAudioElement() {
  if (audioEl) return audioEl;
  const existing = document.getElementById("dj-audio");
  if (existing) {
    audioEl = existing;
  } else {
    const el = document.createElement("audio");
    el.id = "dj-audio";
    el.setAttribute("playsinline", "true");
    el.preload = "none";
    el.className = "hidden";
    document.body.appendChild(el);
    audioEl = el;
  }
  audioEl.setAttribute("playsinline", "true");
  return audioEl;
}

function ensureAudioGraph() {
  const el = getAudioElement();
  if (!el || typeof AudioContext === "undefined") return null;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!gainNode) {
    gainNode = audioCtx.createGain();
    gainNode.gain.value = volumeLevel;
  }
  if (!mediaElementSource) {
    mediaElementSource = audioCtx.createMediaElementSource(el);
    mediaElementSource.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

function renderCategories() {
  const grid = document.getElementById("categories-grid");
  grid.innerHTML = "";
  Object.entries(categories).forEach(([key, cat]) => {
    const col = document.createElement("div");
    col.innerHTML = `
      <h2 class="text-xl font-bold mb-2 text-center">${cat.title}</h2>
      <div class="flex flex-col space-y-2" id="col-${key}"></div>
    `;
    grid.appendChild(col);
    const container = col.querySelector(`#col-${key}`);
    const isHeatmapCategory = ["ass_angriff", "block", "gegner", "sonstiges", "noch_mehr", "noch_mehr2"].includes(
      key
    );

    let minCount = Infinity;
    let maxCount = -Infinity;
    if (isHeatmapCategory) {
      cat.items.forEach((song) => {
        const count = songPlayCounts[song.id] || 0;
        if (count < minCount) minCount = count;
        if (count > maxCount) maxCount = count;
      });
      if (minCount === Infinity) minCount = 0;
      if (maxCount === -Infinity) maxCount = 0;
    }

    cat.items.forEach((song) => {
      const btn = document.createElement("button");
      btn.className = `song-button px-4 py-2 text-lg rounded-lg hover:opacity-80 w-full ${cat.color} relative`;

      if (isHeatmapCategory && cat.baseHSL) {
        const count = songPlayCounts[song.id] || 0;
        let intensity = 0;
        if (maxCount !== minCount) {
          intensity = (count - minCount) / (maxCount - minCount);
        }
        const [h, s, l] = cat.baseHSL;
        const lightness = Math.min(90, l + intensity * 12);
        btn.style.backgroundColor = `hsl(${h}, ${s}%, ${lightness}%)`;
      }

      btn.textContent = `${song.icon} ${song.display}`;
      btn.addEventListener("click", () => {
        playAudio(song.url, song.display, song.category, song.id);
      });

      if (isHeatmapCategory) {
        const badge = document.createElement("div");
        badge.className =
          "absolute top-1 right-1 text-[10px] bg-black bg-opacity-60 px-1 rounded";
        badge.textContent = (songPlayCounts[song.id] || 0).toString();
        btn.appendChild(badge);
      }

      container.appendChild(btn);
    });
  });
}

function playAudio(file, displayTitle = "", categoryKey = null, songId = null) {
  const el = getAudioElement();
  if (!el) return;

  if (fadeIntervalId) {
    clearInterval(fadeIntervalId);
    fadeIntervalId = null;
  }

  ensureAudioGraph();
  el.pause();
  el.currentTime = 0;
  el.src = file;

  if (gainNode) {
    gainNode.gain.value = volumeLevel;
  } else {
    const targetVolume = volumeLevel;
    try {
      el.volume = targetVolume;
    } catch (err) {
      console.warn("Konnte Lautstaerke nicht setzen:", err);
    }
  }

  currentAudio = el;
  incrementPlayCount(songId || displayTitle || file, categoryKey);
  showNowPlaying(displayTitle);
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch((err) => console.warn("Konnte AudioContext nicht resumieren:", err));
  }
  el.onloadedmetadata = () => updateNowPlayingDuration(el);
  el.ontimeupdate = () => updateNowPlayingEta(el);
  el.onended = () => clearNowPlaying();
  el.play().catch((err) => console.error("Audio-Wiedergabe blockiert oder fehlgeschlagen:", err));
}

function stopAudio(forceImmediate = false) {
  const el = getAudioElement();
  if (!el || !currentAudio) return;

  if (fadeIntervalId) {
    clearInterval(fadeIntervalId);
    fadeIntervalId = null;
  }

  const fadeOutTime = 1000;
  const fadeSteps = 30;
  const fadeInterval = fadeOutTime / fadeSteps;
  const canGainFade = !!gainNode;
  const shouldFade = !forceImmediate;

  if (shouldFade && canGainFade) {
    const startGain = gainNode.gain.value || volumeLevel || 1;
    const gainStep = startGain / fadeSteps;
    fadeIntervalId = setInterval(() => {
      const next = gainNode.gain.value - gainStep;
      if (next > 0.001) {
        gainNode.gain.value = next;
      } else {
        clearInterval(fadeIntervalId);
        fadeIntervalId = null;
        gainNode.gain.value = 0.001; // leises Ende, kein Hochspringen
        el.pause();
        el.currentTime = 0;
        currentAudio = null;
      }
    }, fadeInterval);
  } else if (shouldFade && !IS_IOS) {
    const initialVolume = el.volume > 0 ? el.volume : volumeLevel || 1;
    const volumeStep = initialVolume / fadeSteps;
    fadeIntervalId = setInterval(() => {
      if (el.volume > volumeStep + 0.001) {
        el.volume -= volumeStep;
      } else {
        clearInterval(fadeIntervalId);
        fadeIntervalId = null;
        el.volume = 0.001; // leises Ende, dann Stopp
        el.pause();
        el.currentTime = 0;
        currentAudio = null;
      }
    }, fadeInterval);
  } else {
    el.pause();
    el.currentTime = 0;
    currentAudio = null;
  }
  clearNowPlaying();
}

function setVolume(value) {
  const numeric = Math.min(1, Math.max(0, parseFloat(value) || 0));
  volumeLevel = numeric;

  const el = getAudioElement();
  if (!el) return;

  ensureAudioGraph();

  if (gainNode) {
    gainNode.gain.value = volumeLevel;
    return;
  }

  try {
    el.volume = volumeLevel;
  } catch (err) {
    console.warn("Konnte Lautstaerke nicht setzen:", err);
  }
}

function updateSpecialButtons() {
  const map = [
    { id: "btn-timeout", key: "timeout", fallback: "Timeout", prefix: "" },
    { id: "btn-walkon", key: "walkon", fallback: "Walk-On", prefix: "" },
    { id: "btn-pause1", key: "pause1", fallback: "Pause 1", prefix: "Pause: " },
    { id: "btn-pause2", key: "pause2", fallback: "Pause 2", prefix: "Pause: " },
  ];

  map.forEach(({ id, key, fallback, prefix }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const track = specialTracks[key];
    if (track && track.display) {
      btn.textContent = prefix ? `${prefix}${track.display}` : track.display;
    } else {
      btn.textContent = fallback;
    }
  });
}

function showNowPlaying(title = "") {
  const { box, title: t, eta } = nowPlayingEls;
  nowPlaying.title = title || "Playing";
  if (t) t.textContent = nowPlaying.title;
  if (eta) eta.textContent = "--:--";
  if (box) box.classList.remove("hidden");
}

function updateNowPlayingDuration(el) {
  nowPlaying.duration = el && isFinite(el.duration) ? el.duration : 0;
  updateNowPlayingEta(el);
}

function updateNowPlayingEta(el) {
  const { eta } = nowPlayingEls;
  if (!eta || !el) return;
  const remaining = (el.duration || 0) - (el.currentTime || 0);
  eta.textContent = formatTime(remaining);
  toggleNowPlayingWarning(remaining);
}

function clearNowPlaying() {
  const { box, eta } = nowPlayingEls;
  nowPlaying = { title: "", duration: 0 };
  if (eta) eta.textContent = "--:--";
  if (box) box.classList.add("hidden");
  toggleNowPlayingWarning(Infinity);
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

document.addEventListener("DOMContentLoaded", () => {
  audioEl = getAudioElement();
  if (audioEl) {
    audioEl.preload = "none";
    audioEl.setAttribute("playsinline", "true");
  }
  nowPlayingEls = {
    box: document.getElementById("now-playing"),
    title: document.getElementById("now-playing-title"),
    eta: document.getElementById("now-playing-eta"),
  };
  zoomEls = {
    level: document.getElementById("zoom-level"),
    inBtn: document.getElementById("zoom-in"),
    outBtn: document.getElementById("zoom-out"),
    resetBtn: document.getElementById("reset-counts"),
  };
  initZoomControls();

  const fileInput = document.getElementById("filepicker");
  const loadButton = document.getElementById("load-songs-btn");
  const btnTimeout = document.getElementById("btn-timeout");
  const btnWalkon = document.getElementById("btn-walkon");
  const btnPause1 = document.getElementById("btn-pause1");
  const btnPause2 = document.getElementById("btn-pause2");

  if (loadButton && fileInput) {
    loadButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
  }

  const bindSpecial = (btn, key, label) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const track = specialTracks[key];
      if (track && track.url) {
        playAudio(track.url, track.display || label);
      } else {
        alert(`Kein ${label}-Track geladen.`);
      }
    });
  };

  bindSpecial(btnTimeout, "timeout", "Timeout");
  bindSpecial(btnWalkon, "walkon", "Walk-On");
  bindSpecial(btnPause1, "pause1", "Pause 1");
  bindSpecial(btnPause2, "pause2", "Pause 2");

  updateSpecialButtons();
  loadPlayCounts();
});

function toggleNowPlayingWarning(remainingSeconds) {
  const { box } = nowPlayingEls;
  if (!box) return;
  if (remainingSeconds <= NOW_PLAYING_WARNING_THRESHOLD) {
    box.classList.add("now-playing-warning");
  } else {
    box.classList.remove("now-playing-warning");
  }
}

function incrementPlayCount(id, categoryKey) {
  if (!categoryKey || ["spass"].includes(categoryKey)) return;
  songPlayCounts[id] = (songPlayCounts[id] || 0) + 1;
  savePlayCounts();
  renderSingleCategory(categoryKey);
}

function savePlayCounts() {
  try {
    localStorage.setItem("songPlayCounts", JSON.stringify(songPlayCounts));
  } catch (e) {
    console.warn("Konnte songPlayCounts nicht speichern:", e);
  }
}

function loadPlayCounts() {
  try {
    const data = localStorage.getItem("songPlayCounts");
    if (data) {
      songPlayCounts = JSON.parse(data);
    }
  } catch (e) {
    console.warn("Konnte songPlayCounts nicht laden:", e);
  }
}

function renderSingleCategory(key) {
  const cat = categories[key];
  if (!cat) return;
  const container = document.querySelector(`#col-${key}`);
  if (!container) return;
  container.innerHTML = "";

  const isHeatmapCategory = ["ass_angriff", "block", "gegner", "sonstiges", "noch_mehr", "noch_mehr2"].includes(
    key
  );

  let minCount = Infinity;
  let maxCount = -Infinity;
  if (isHeatmapCategory) {
    cat.items.forEach((song) => {
      const count = songPlayCounts[song.id] || 0;
      if (count < minCount) minCount = count;
      if (count > maxCount) maxCount = count;
    });
    if (minCount === Infinity) minCount = 0;
    if (maxCount === -Infinity) maxCount = 0;
  }

  cat.items.forEach((song) => {
    const btn = document.createElement("button");
    btn.className = `song-button px-4 py-2 text-lg rounded-lg hover:opacity-80 w-full ${cat.color} relative`;

    if (isHeatmapCategory && cat.baseHSL) {
      const count = songPlayCounts[song.id] || 0;
      let intensity = 0;
      if (maxCount !== minCount) {
        intensity = (count - minCount) / (maxCount - minCount);
      }
      const [h, s, l] = cat.baseHSL;
      const lightness = Math.min(90, l + intensity * 12);
      btn.style.backgroundColor = `hsl(${h}, ${s}%, ${lightness}%)`;
    }

    btn.textContent = `${song.icon} ${song.display}`;
    btn.addEventListener("click", () => {
      console.log("Song click", { id: song.id, category: song.category });
      playAudio(song.url, song.display, song.category, song.id);
    });

    if (isHeatmapCategory) {
      const badge = document.createElement("div");
      badge.className = "absolute top-1 right-1 text-[10px] bg-black bg-opacity-60 px-1 rounded";
      badge.textContent = (songPlayCounts[song.id] || 0).toString();
      btn.appendChild(badge);
    }

    container.appendChild(btn);
  });
}

function initZoomControls() {
  const { level, inBtn, outBtn, resetBtn } = zoomEls;
  const applyZoom = () => {
    document.documentElement.style.fontSize = `${16 * zoomLevel}px`;
    if (level) level.textContent = `${Math.round(zoomLevel * 100)}%`;
  };
  applyZoom();
  if (inBtn) {
    inBtn.addEventListener("click", () => {
      zoomLevel = Math.min(ZOOM_MAX, parseFloat((zoomLevel + ZOOM_STEP).toFixed(2)));
      applyZoom();
    });
  }
  if (outBtn) {
    outBtn.addEventListener("click", () => {
      zoomLevel = Math.max(ZOOM_MIN, parseFloat((zoomLevel - ZOOM_STEP).toFixed(2)));
      applyZoom();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetPlayCounts();
    });
  }
}

function resetPlayCounts() {
  songPlayCounts = {};
  savePlayCounts();
  console.log("Reset play counts");
  renderCategories();
}

function playRandomTrack() {
  const candidateCategories = ["ass_angriff", "block", "sonstiges", "noch_mehr", "noch_mehr2"];
  const pool = [];
  candidateCategories.forEach((key) => {
    const cat = categories[key];
    if (!cat || !cat.items || cat.items.length === 0) return;
    cat.items.forEach((song) => pool.push({ song, category: key }));
  });
  if (pool.length === 0) {
    alert("Keine Songs in den zufaelligen Kategorien geladen.");
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  playAudio(pick.song.url, pick.song.display, pick.category, pick.song.id);
}
