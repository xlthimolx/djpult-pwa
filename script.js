let currentAudio = null;
let volumeLevel = 1.0;

const categories = {
  ass_angriff: { title: "Ass/Angriff", color: "bg-blue-600", items: [] },
  block: { title: "Block", color: "bg-pink-600", items: [] },
  gegner: { title: "Gegner", color: "bg-red-600", items: [] },
  sonstiges: { title: "_", color: "bg-green-600", items: [] },
  noch_mehr: { title: "_", color: "bg-green-600", items: [] },
  spass: { title: "Lustig", color: "bg-purple-600", items: [] },
};

const icons = {
  ass_angriff: "\uD83D\uDD25",
  block: "\uD83E\uDDF1",
  gegner: "\u2694\uFE0F",
  spass: "\uD83C\uDF89",
  sonstiges: "\uD83C\uDFB5",
  noch_mehr: "\uD83C\uDFB5",
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
      key = toggle % 2 === 0 ? "sonstiges" : "noch_mehr";
      toggle += 1;
    }

    categories[key].items.push({
      name: file.name,
      display: cleanName(file.name),
      icon: icons[key],
      url: URL.createObjectURL(file),
    });
  });

  renderCategories();
  updateSpecialButtons();
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
    cat.items.forEach((song) => {
      const btn = document.createElement("button");
      btn.className = `song-button px-4 py-2 text-lg rounded-lg hover:opacity-80 w-full ${cat.color}`;
      btn.textContent = `${song.icon} ${song.display}`;
      btn.addEventListener("click", () => playAudio(song.url));
      container.appendChild(btn);
    });
  });
}

function playAudio(file) {
  if (currentAudio) {
    currentAudio.pause();
  }
  currentAudio = new Audio(file);
  currentAudio.volume = volumeLevel;
  currentAudio.play();
}

function stopAudio() {
  if (currentAudio) {
    const fadeOutTime = 1000;
    const fadeSteps = 30;
    const fadeInterval = fadeOutTime / fadeSteps;
    const volumeStep = currentAudio.volume / fadeSteps;
    const fadeOut = setInterval(() => {
      if (currentAudio.volume > volumeStep) {
        currentAudio.volume -= volumeStep;
      } else {
        clearInterval(fadeOut);
        currentAudio.pause();
        currentAudio = null;
      }
    }, fadeInterval);
  }
}

function setVolume(value) {
  volumeLevel = value;
  if (currentAudio) currentAudio.volume = volumeLevel;
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

document.addEventListener("DOMContentLoaded", () => {
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
        playAudio(track.url);
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
});
