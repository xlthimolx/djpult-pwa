let audioEl = null; // zentrales Audio-Element fuer alle Plattformen
let audioCtx = null; // Web Audio Kontext (fuer iOS/Volume/Fade)
let gainNode = null; // Gain fuer Volume/Fade
let mediaElementSource = null; // MediaElementSource fuer das zentrale Audio
let currentAudio = null;
let volumeLevel = 1.0;
let fadeIntervalId = null;
let nowPlaying = { title: "", duration: 0, category: null };
let nowPlayingEls = { box: null, title: null, eta: null };
const NOW_PLAYING_WARNING_THRESHOLD = 10; // Sekunden
let songPlayCounts = {};
let zoomLevel = 0.9;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.2;
const ZOOM_STEP = 0.05;
let zoomEls = { level: null, inBtn: null, outBtn: null };
let infoEls = { panel: null, toggle: null };
let searchTerm = "";
let searchEls = { input: null, count: null };
let headerEls = { block: null, toggle: null };

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
  pauses: [],
};

const remoteCategories = ["ass_angriff", "block", "spass", "sonstiges", "noch_mehr", "noch_mehr2"];

const rtcState = {
  pc: null,
  channel: null,
  offerCandidates: [],
  status: "disconnected",
  ui: {},
  scanner: { stream: null, frameReq: null, video: null, canvas: null, ctx: null },
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
    .replace(/_PAUSE\d*/i, "")
    .replace(/\.(mp3|flac|wav|ogg)$/i, "")
    .trim();
}

function resetCategories() {
  Object.values(categories).forEach((cat) => {
    cat.items = [];
  });
  specialTracks.timeout = null;
  specialTracks.walkon = null;
  specialTracks.pauses = [];
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
      else if (/_PAUSE\d+/i.test(upper)) key = "pause";

      if (key === "pause") {
        const match = upper.match(/_PAUSE(\d+)/);
        const number = match ? parseInt(match[1], 10) : specialTracks.pauses.length + 1;
        specialTracks.pauses.push({
          name: file.name,
          display: cleanName(file.name),
          number,
          url: URL.createObjectURL(file),
        });
      } else if (key) {
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
  collapseHeader();
  sendSongsListToRemote();
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
  let totalMatches = 0;
  Object.entries(categories).forEach(([key, cat]) => {
    const col = document.createElement("div");
    col.classList.add("category-col");
    col.setAttribute("data-category", key);
    col.innerHTML = `
      <h2 class="text-xl font-bold mb-2 text-center">${cat.title}</h2>
      <div class="flex flex-col space-y-2 category-list" id="col-${key}" data-category="${key}"></div>
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
      const isMatch = matchesSearch(song);
      if (isMatch) totalMatches += 1;
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

      if (isMatch) {
        btn.classList.add("search-hit");
      }

      btn.textContent = `${song.icon} ${song.display}`;
      btn.addEventListener("click", () => {
        playAudio(song.url, song.display, song.category, song.id);
        clearSearch();
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
  updateSearchCount(totalMatches);
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
  nowPlaying.category = categoryKey || null;
  incrementPlayCount(songId || displayTitle || file, categoryKey);
  showNowPlaying(displayTitle);
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch((err) => console.warn("Konnte AudioContext nicht resumieren:", err));
  }
  el.onloadedmetadata = () => {
    updateNowPlayingDuration(el);
    sendNowPlayingStatus({ title: displayTitle, category: categoryKey, duration: el.duration || 0 });
  };
  el.ontimeupdate = () => updateNowPlayingEta(el);
  el.onended = () => clearNowPlaying();
  el.play().catch((err) => console.error("Audio-Wiedergabe blockiert oder fehlgeschlagen:", err));
  sendNowPlayingStatus({ title: displayTitle, category: categoryKey });
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

  sendNowPlayingStatus({ title: "", category: null, duration: 0, stopped: true });

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

  renderPauseButtons();
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
  nowPlaying = { title: "", duration: 0, category: null };
  if (eta) eta.textContent = "--:--";
  if (box) box.classList.add("hidden");
  toggleNowPlayingWarning(Infinity);
  sendNowPlayingStatus({ title: "", category: null, duration: 0, stopped: true });
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
  headerEls = {
    block: document.getElementById("header-block"),
    toggle: document.getElementById("toggle-header"),
  };
  infoEls = {
    panel: document.getElementById("info-panel"),
    toggle: document.getElementById("info-toggle"),
  };
  zoomEls = {
    level: document.getElementById("zoom-level"),
    inBtn: document.getElementById("zoom-in"),
    outBtn: document.getElementById("zoom-out"),
    resetBtn: document.getElementById("reset-counts"),
  };
  searchEls = {
    input: document.getElementById("search-input"),
    count: document.getElementById("search-count"),
  };
  rtcState.ui = {
    panel: document.getElementById("pairing-panel"),
    toggle: document.getElementById("pairing-toggle"),
    status: document.getElementById("pairing-status"),
    offerText: document.getElementById("player-offer-text"),
    answerText: document.getElementById("player-answer-text"),
    offerQr: document.getElementById("player-offer-qr"),
    log: document.getElementById("pairing-log"),
    createOfferBtn: document.getElementById("create-offer-btn"),
    refreshOfferBtn: document.getElementById("refresh-offer-btn"),
    applyAnswerBtn: document.getElementById("apply-answer-btn"),
    scanAnswerBtn: document.getElementById("scan-answer-btn"),
    stopScanBtn: document.getElementById("stop-scan-btn"),
    closeBtn: document.getElementById("pairing-close-btn"),
  };
  rtcState.scanner.video = document.getElementById("answer-video");
  rtcState.scanner.canvas = document.getElementById("answer-canvas");
  if (rtcState.scanner.canvas) {
    rtcState.scanner.ctx = rtcState.scanner.canvas.getContext("2d");
  }
  initZoomControls();
  initSearchControls();
  initPairingUI();

  const fileInput = document.getElementById("filepicker");
  const loadButton = document.getElementById("load-songs-btn");
  const btnTimeout = document.getElementById("btn-timeout");
  const btnWalkon = document.getElementById("btn-walkon");

  if (loadButton && fileInput) {
    loadButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
  }
  if (headerEls.toggle) {
    headerEls.toggle.addEventListener("click", toggleHeaderVisibility);
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
    const isMatch = matchesSearch(song);
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

    if (isMatch) {
      btn.classList.add("search-hit");
    }

    btn.textContent = `${song.icon} ${song.display}`;
    btn.addEventListener("click", () => {
      console.log("Song click", { id: song.id, category: song.category });
      playAudio(song.url, song.display, song.category, song.id);
      clearSearch();
    });

    if (isHeatmapCategory) {
      const badge = document.createElement("div");
      badge.className = "absolute top-1 right-1 text-[10px] bg-black bg-opacity-60 px-1 rounded";
      badge.textContent = (songPlayCounts[song.id] || 0).toString();
      btn.appendChild(badge);
    }

    container.appendChild(btn);
  });
  updateSearchCount(countSearchHits());
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

function collapseHeader() {
  if (!headerEls.block) return;
  headerEls.block.classList.add("header-hidden");
  headerEls.block.style.display = "none";
  if (headerEls.toggle) {
    headerEls.toggle.textContent = "Kopf einblenden";
    headerEls.toggle.dataset.collapsed = "true";
  }
  document.body.classList.add("header-collapsed");
}

function toggleHeaderVisibility() {
  if (!headerEls.block) return;
  const hidden = headerEls.block.classList.toggle("header-hidden");
  headerEls.block.style.display = hidden ? "none" : "";
  if (headerEls.toggle) {
    headerEls.toggle.textContent = hidden ? "Kopf einblenden" : "Kopf ausblenden";
    headerEls.toggle.dataset.collapsed = hidden ? "true" : "false";
  }
  document.body.classList.toggle("header-collapsed", hidden);
}

function renderPauseButtons() {
  const container = document.getElementById("pause-buttons");
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(specialTracks.pauses) || specialTracks.pauses.length === 0) return;

  const sorted = [...specialTracks.pauses].sort((a, b) => (a.number || 0) - (b.number || 0));
  sorted.forEach((track, idx) => {
    const base = track.display || `Pause ${track.number || idx + 1}`;
    const label = `Pause: ${base}`;
    const btn = document.createElement("button");
    btn.className = "bg-orange-500 rounded-lg hover:bg-yellow-700 text-xl px-3 py-3 w-full";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      playAudio(track.url, label);
    });
    container.appendChild(btn);
  });
}

function initCategoryScrollSync() {
  const miscKeys = new Set(["sonstiges", "noch_mehr", "noch_mehr2"]);
  let isSyncing = false;
  const miscLists = Array.from(document.querySelectorAll(".category-list")).filter((el) =>
    miscKeys.has(el.dataset.category)
  );

  miscLists.forEach((el) => {
    el.onscroll = null;
    el.addEventListener("scroll", () => {
      if (isSyncing) return;
      isSyncing = true;
      const target = el.scrollTop;
      miscLists.forEach((other) => {
        if (other !== el) {
          other.scrollTop = target;
        }
      });
      isSyncing = false;
    });
  });
}

function initSearchControls() {
  const { input } = searchEls;
  if (!input) return;
  input.addEventListener("input", (e) => setSearchTerm(e.target.value));
  setSearchTerm("");
}

function setSearchTerm(value) {
  const normalized = (value || "").trim().toLowerCase();
  searchTerm = normalized;
  renderCategories();
}

function matchesSearch(song) {
  if (!searchTerm) return false;
  const haystack = `${song.display || ""} ${song.name || ""}`.toLowerCase();
  return haystack.includes(searchTerm);
}

function countSearchHits() {
  if (!searchTerm) return 0;
  let hits = 0;
  Object.values(categories).forEach((cat) => {
    cat.items.forEach((song) => {
      if (matchesSearch(song)) hits += 1;
    });
  });
  return hits;
}

function updateSearchCount(count) {
  const el = searchEls.count;
  if (!el) return;
  const value = searchTerm ? count : 0;
  el.textContent = `${value} Treffer`;
}

function clearSearch() {
  if (!searchTerm) return;
  searchTerm = "";
  if (searchEls.input) {
    searchEls.input.value = "";
  }
  renderCategories();
}

function toggleInfo() {
  const panel = infoEls.panel || document.getElementById("info-panel");
  if (!panel) return;
  panel.classList.toggle("hidden");
}

function playRandomTrack() {
  const candidateCategories = ["ass_angriff", "block", "sonstiges", "noch_mehr", "noch_mehr2"];
  const pool = [];
  candidateCategories.forEach((key) => {
    const cat = categories[key];
    if (!cat || !cat.items || cat.items.length === 0) return;
    cat.items.forEach((song) => {
      const count = songPlayCounts[song.id] || 0;
      // Noch staerkere Gewichtung: selten gespielte Titel werden deutlich bevorzugt
      // Gewicht = 1 / (1 + count)^3, Mindestgewicht 0.01
      const weight = Math.max(0.01, 1 / Math.pow(1 + count, 3));
      pool.push({ song, category: key, weight });
    });
  });
  if (pool.length === 0) {
    alert("Keine Songs in den zufaelligen Kategorien geladen.");
    return;
  }
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  const r = Math.random() * totalWeight;
  let acc = 0;
  let chosen = pool[0];
  for (const item of pool) {
    acc += item.weight;
    if (r <= acc) {
      chosen = item;
      break;
    }
  }
  playAudio(chosen.song.url, chosen.song.display, chosen.category, chosen.song.id);
}

function playRandomOpponentTrack() {
  const cat = categories["gegner"];
  const pool = [];
  if (cat && Array.isArray(cat.items)) {
    cat.items.forEach((song) => {
      const count = songPlayCounts[song.id] || 0;
      const weight = Math.max(0.01, 1 / Math.pow(1 + count, 3));
      pool.push({ song, weight });
    });
  }
  if (pool.length === 0) {
    alert("Keine Songs in der Gegner-Kategorie geladen.");
    return;
  }
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  const r = Math.random() * totalWeight;
  let acc = 0;
  let chosen = pool[0];
  for (const item of pool) {
    acc += item.weight;
    if (r <= acc) {
      chosen = item;
      break;
    }
  }
  playAudio(chosen.song.url, chosen.song.display, "gegner", chosen.song.id);
}

// -----------------------------
// WebRTC Remote-Control (Player)
// -----------------------------

function initPairingUI() {
  const { toggle, panel, createOfferBtn, refreshOfferBtn, applyAnswerBtn, scanAnswerBtn, stopScanBtn, closeBtn } = rtcState.ui;
  if (toggle && panel) {
    toggle.addEventListener("click", () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) {
        panel.scrollTop = 0;
      }
    });
  }
  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  }
  if (createOfferBtn) createOfferBtn.addEventListener("click", startPlayerOffer);
  if (refreshOfferBtn) refreshOfferBtn.addEventListener("click", () => {
    cleanupPlayerRTC();
    resetPairingUI();
    startPlayerOffer();
  });
  if (applyAnswerBtn) applyAnswerBtn.addEventListener("click", applyAnswerFromInput);
  if (scanAnswerBtn) scanAnswerBtn.addEventListener("click", startAnswerScan);
  if (stopScanBtn) stopScanBtn.addEventListener("click", stopAnswerScan);
}

function resetPairingUI() {
  const { offerText, answerText, offerQr, log, status } = rtcState.ui;
  if (offerText) offerText.value = "";
  if (answerText) answerText.value = "";
  if (offerQr) offerQr.innerHTML = "";
  if (log) log.textContent = "";
  if (status) status.textContent = "Getrennt";
}

function updatePairingStatus(text) {
  if (rtcState.ui.status) {
    rtcState.ui.status.textContent = text;
  }
}

function logPairing(message) {
  const el = rtcState.ui.log;
  if (!el) return;
  const ts = new Date().toLocaleTimeString();
  el.textContent = `[${ts}] ${message}\n${el.textContent}`.slice(0, 2000);
}

function cleanupPlayerRTC() {
  if (rtcState.channel) {
    try {
      rtcState.channel.close();
    } catch (e) {
      console.warn("Channel close failed", e);
    }
  }
  if (rtcState.pc) {
    try {
      rtcState.pc.close();
    } catch (e) {
      console.warn("PC close failed", e);
    }
  }
  rtcState.pc = null;
  rtcState.channel = null;
  rtcState.offerCandidates = [];
  rtcState.status = "disconnected";
  stopAnswerScan();
  updatePairingStatus("Getrennt");
}

async function startPlayerOffer() {
  try {
    cleanupPlayerRTC();
    updatePairingStatus("Verbinde...");
    logPairing("Erzeuge Offer...");
    const pc = new RTCPeerConnection({ iceServers: [] });
    rtcState.pc = pc;
    rtcState.offerCandidates = [];
    const channel = pc.createDataChannel("remote");
    rtcState.channel = channel;
    wireDataChannel(channel);
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        rtcState.offerCandidates.push(ev.candidate);
      }
    };
    pc.oniceconnectionstatechange = () => {
      logPairing(`ICE: ${pc.iceConnectionState}`);
    };
    pc.onconnectionstatechange = () => {
      logPairing(`Connection: ${pc.connectionState}`);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        updatePairingStatus("Getrennt");
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceComplete(pc);
    const payload = {
      type: "offer",
      sdp: pc.localDescription.sdp,
      ice: rtcState.offerCandidates,
    };
    const encoded = encodeSignalPayload(payload);
    renderOfferQr(encoded);
    if (rtcState.ui.offerText) rtcState.ui.offerText.value = encoded;
    updatePairingStatus("Offer bereit");
    logPairing("Offer bereit. QR/Text an Remote senden.");
  } catch (err) {
    console.error(err);
    logPairing(`Fehler beim Offer: ${err.message || err}`);
    updatePairingStatus("Fehler");
  }
}

function renderOfferQr(text) {
  const target = rtcState.ui.offerQr;
  if (!target) return;
  target.innerHTML = "";
  if (typeof QRCode === "undefined") {
    target.textContent = "QR-Bibliothek fehlt.";
    return;
  }
  new QRCode(target, {
    text,
    width: 160,
    height: 160,
    correctLevel: QRCode.CorrectLevel.L,
  });
}

async function applyAnswerFromInput() {
  try {
    if (!rtcState.pc) {
      logPairing("Kein aktiver Offer. Bitte neu starten.");
      return;
    }
    const text = (rtcState.ui.answerText?.value || "").trim();
    if (!text) {
      logPairing("Keine Answer im Feld gefunden.");
      return;
    }
    const payload = decodeSignalPayload(text);
    if (!payload || payload.type !== "answer" || !payload.sdp) {
      logPairing("Ungültige Answer.");
      return;
    }
    await rtcState.pc.setRemoteDescription(new RTCSessionDescription({ type: payload.type, sdp: payload.sdp }));
    if (Array.isArray(payload.ice)) {
      for (const cand of payload.ice) {
        try {
          await rtcState.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn("Konnte ICE-Kandidat nicht setzen:", err);
        }
      }
    }
    updatePairingStatus("Answer gesetzt");
    logPairing("Answer übernommen. Warte auf DataChannel...");
  } catch (err) {
    console.error(err);
    logPairing(`Fehler beim Anwenden der Answer: ${err.message || err}`);
    updatePairingStatus("Fehler");
  }
}

function wireDataChannel(channel) {
  if (!channel) return;
  channel.onopen = () => {
    rtcState.status = "connected";
    updatePairingStatus("Verbunden");
    logPairing("Remote verbunden.");
    unlockAudioForRemote();
    sendSongsListToRemote();
  };
  channel.onclose = () => {
    rtcState.status = "disconnected";
    updatePairingStatus("Getrennt");
    logPairing("Remote getrennt.");
  };
  channel.onerror = (err) => logPairing(`Channel-Fehler: ${err?.message || err}`);
  channel.onmessage = handleRemoteMessage;
}

function handleRemoteMessage(event) {
  let msg = null;
  try {
    msg = JSON.parse(event.data);
  } catch (err) {
    console.warn("Ungültige Nachricht", err);
    return;
  }
  if (!msg) return;
  if (msg.type === "command") {
    handleRemoteCommand(msg.command, msg.payload || {});
  }
}

function handleRemoteCommand(command, payload) {
  switch (command) {
    case "play": {
      const ok = playSongFromRemote(payload);
      if (!ok) logPairing("Song nicht gefunden.");
      break;
    }
    case "stop":
      stopAudio();
      break;
    case "randomStandard":
      playRandomTrack();
      break;
    case "randomOpponent":
      playRandomOpponentTrack();
      break;
    case "special":
      handleSpecialFromRemote(payload);
      break;
    case "volume":
      handleRemoteVolume(payload);
      break;
    case "requestSongs":
      sendSongsListToRemote();
      break;
    default:
      logPairing(`Unbekannter Command: ${command}`);
  }
  sendAck(command);
}

function playSongFromRemote(payload) {
  if (!payload) return false;
  const { id, category } = payload;
  if (!id || !category) return false;
  const song = findSongById(category, id);
  if (!song) return false;
  playAudio(song.url, song.display, category, song.id);
  return true;
}

function findSongById(categoryKey, songId) {
  const cat = categories[categoryKey];
  if (!cat || !Array.isArray(cat.items)) return null;
  return cat.items.find((song) => song.id === songId || song.name === songId) || null;
}

function handleSpecialFromRemote(payload) {
  if (!payload || !payload.type) return;
  if (payload.type === "timeout" && specialTracks.timeout) {
    playAudio(specialTracks.timeout.url, specialTracks.timeout.display || "Timeout");
    return;
  }
  if (payload.type === "walkon" && specialTracks.walkon) {
    playAudio(specialTracks.walkon.url, specialTracks.walkon.display || "Walk-On");
    return;
  }
  if (payload.type === "pause") {
    const id = payload.id;
    const target = specialTracks.pauses.find(
      (p) => p.number === Number(id) || p.display === id || p.name === id || (typeof id === "string" && id && p.display === id)
    );
    if (target) {
      const label = target.display || `Pause ${target.number || ""}`;
      playAudio(target.url, label);
    }
  }
}

function handleRemoteVolume(payload) {
  if (!payload || typeof payload.value === "undefined") return;
  let val = Number(payload.value);
  if (val > 1) {
    val = val / 100;
  }
  val = Math.min(1, Math.max(0, val));
  setVolume(val);
}

function sendChannelMessage(obj) {
  if (!rtcState.channel || rtcState.channel.readyState !== "open") return;
  try {
    rtcState.channel.send(JSON.stringify(obj));
  } catch (err) {
    console.warn("Konnte Nachricht nicht senden:", err);
  }
}

function sendAck(command) {
  sendChannelMessage({ type: "ack", command });
}

function sendSongsListToRemote() {
  if (!rtcState.channel || rtcState.channel.readyState !== "open") return;
  const payload = buildSongsListPayload();
  sendChannelMessage({ type: "songsList", data: payload });
}

function buildSongsListPayload() {
  const songs = [];
  remoteCategories.forEach((key) => {
    const cat = categories[key];
    if (!cat || !Array.isArray(cat.items)) return;
    cat.items.forEach((song) => {
      songs.push({ id: song.id, display: song.display, category: key });
    });
  });
  const specials = {
    timeout: specialTracks.timeout
      ? { id: specialTracks.timeout.name, display: specialTracks.timeout.display || "Timeout" }
      : null,
    walkon: specialTracks.walkon
      ? { id: specialTracks.walkon.name, display: specialTracks.walkon.display || "Walk-On" }
      : null,
    pauses: Array.isArray(specialTracks.pauses)
      ? specialTracks.pauses.map((p) => ({
          id: p.number || p.name,
          display: p.display || `Pause ${p.number || ""}`,
          number: p.number || null,
        }))
      : [],
  };
  return { songs, specials };
}

function sendNowPlayingStatus(data) {
  if (!rtcState.channel || rtcState.channel.readyState !== "open") return;
  const payload = {
    title: data?.title || "",
    category: data?.category || null,
    duration: data?.duration || 0,
    stopped: !!data?.stopped,
  };
  sendChannelMessage({ type: "nowPlaying", data: payload });
}

function encodeSignalPayload(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSignalPayload(str) {
  const clean = (str || "").trim();
  const json = decodeURIComponent(escape(atob(clean)));
  return JSON.parse(json);
}

function waitForIceComplete(pc) {
  return new Promise((resolve) => {
    if (!pc || pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const checkState = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", checkState);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", checkState);
  });
}

function unlockAudioForRemote() {
  const el = getAudioElement();
  if (!el) return;
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  // Versuch, Autoplay-Sperre zu loesen: kurz stumm spielen/pause
  try {
    const prevMuted = el.muted;
    el.muted = true;
    el.play().then(() => {
      el.pause();
      el.muted = prevMuted;
      if (gainNode) gainNode.gain.value = volumeLevel;
    }).catch(() => {
      el.muted = prevMuted;
    });
  } catch (err) {
    console.warn("Unlock fehlgeschlagen", err);
  }
}

async function startAnswerScan() {
  const { video, canvas } = rtcState.scanner;
  const { scanAnswerBtn, stopScanBtn } = rtcState.ui;
  if (!video || !canvas) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    rtcState.scanner.stream = stream;
    video.srcObject = stream;
    await video.play();
    video.classList.remove("hidden");
    canvas.classList.add("hidden");
    if (scanAnswerBtn) scanAnswerBtn.classList.add("hidden");
    if (stopScanBtn) stopScanBtn.classList.remove("hidden");
    tickAnswerScan();
    logPairing("Scanner gestartet.");
  } catch (err) {
    console.error(err);
    logPairing("Kamera/Scanner nicht verfügbar.");
  }
}

function tickAnswerScan() {
  const { video, canvas, ctx } = rtcState.scanner;
  if (!video || !canvas || !ctx) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== "undefined") {
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (code && code.data) {
        stopAnswerScan();
        if (rtcState.ui.answerText) rtcState.ui.answerText.value = code.data;
        logPairing("Answer-QR gelesen. Bitte anwenden.");
        return;
      }
    }
  }
  rtcState.scanner.frameReq = requestAnimationFrame(tickAnswerScan);
}

function stopAnswerScan() {
  const { stream, frameReq, video } = rtcState.scanner;
  const { scanAnswerBtn, stopScanBtn } = rtcState.ui;
  if (frameReq) cancelAnimationFrame(frameReq);
  rtcState.scanner.frameReq = null;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  rtcState.scanner.stream = null;
  if (video) {
    video.pause();
    video.srcObject = null;
    video.classList.add("hidden");
  }
  if (scanAnswerBtn) scanAnswerBtn.classList.remove("hidden");
  if (stopScanBtn) stopScanBtn.classList.add("hidden");
}
