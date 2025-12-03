const remoteCategories = [
  { key: "ass_angriff", title: "Ass/Angriff", color: "bg-blue-600" },
  { key: "block", title: "Block", color: "bg-pink-600" },
  { key: "spass", title: "Lustig", color: "bg-purple-600" },
  { key: "sonstiges", title: "Sonstiges", color: "bg-green-600" },
  { key: "noch_mehr", title: "Noch mehr", color: "bg-green-600" },
  { key: "noch_mehr2", title: "Noch mehr 2", color: "bg-green-600" },
];

const rtc = {
  pc: null,
  channel: null,
  candidates: [],
  status: "disconnected",
  ui: {},
  scanner: { video: null, canvas: null, ctx: null, stream: null, frameReq: null },
  songs: [],
  specials: { timeout: null, walkon: null, pauses: [] },
};

document.addEventListener("DOMContentLoaded", () => {
  rtc.ui = {
    offerInput: document.getElementById("offer-input"),
    connectBtn: document.getElementById("connect-btn"),
    scanOfferBtn: document.getElementById("scan-offer-btn"),
    stopOfferScanBtn: document.getElementById("stop-offer-scan-btn"),
    answerOutput: document.getElementById("answer-output"),
    answerQr: document.getElementById("answer-qr"),
    status: document.getElementById("remote-status"),
    log: document.getElementById("remote-log"),
    randomBtn: document.getElementById("random-btn"),
    randomOpponentBtn: document.getElementById("random-opponent-btn"),
    stopBtn: document.getElementById("stop-btn"),
    volume: document.getElementById("remote-volume"),
    songSections: document.getElementById("song-sections"),
    nowPlaying: document.getElementById("now-playing-remote"),
    nowCategory: document.getElementById("now-playing-category"),
    timeoutBtn: document.getElementById("special-timeout"),
    walkonBtn: document.getElementById("special-walkon"),
    pausesContainer: document.getElementById("special-pauses"),
    offerVideo: document.getElementById("offer-video"),
    offerCanvas: document.getElementById("offer-canvas"),
    refreshBtn: document.getElementById("refresh-connection-btn"),
  };
  rtc.scanner.video = rtc.ui.offerVideo;
  rtc.scanner.canvas = rtc.ui.offerCanvas;
  if (rtc.scanner.canvas) {
    rtc.scanner.ctx = rtc.scanner.canvas.getContext("2d");
  }
  bindRemoteUI();
  resetUIState();
});

function bindRemoteUI() {
  const {
    connectBtn,
    scanOfferBtn,
    stopOfferScanBtn,
    randomBtn,
    randomOpponentBtn,
    stopBtn,
    volume,
    timeoutBtn,
    walkonBtn,
    refreshBtn,
  } = rtc.ui;

  if (connectBtn) connectBtn.addEventListener("click", connectWithOffer);
  if (scanOfferBtn) scanOfferBtn.addEventListener("click", startOfferScan);
  if (stopOfferScanBtn) stopOfferScanBtn.addEventListener("click", stopOfferScan);
  if (refreshBtn) refreshBtn.addEventListener("click", () => {
    resetUIState();
    connectWithOffer();
  });

  if (randomBtn) randomBtn.addEventListener("click", () => sendCommand("randomStandard"));
  if (randomOpponentBtn) randomOpponentBtn.addEventListener("click", () => sendCommand("randomOpponent"));
  if (stopBtn) stopBtn.addEventListener("click", () => sendCommand("stop"));
  if (volume) {
    volume.addEventListener("input", (e) => {
      const val = Number(e.target.value || 0);
      sendCommand("volume", { value: val });
    });
  }
  if (timeoutBtn) timeoutBtn.addEventListener("click", () => sendCommand("special", { type: "timeout" }));
  if (walkonBtn) walkonBtn.addEventListener("click", () => sendCommand("special", { type: "walkon" }));
}

function resetUIState() {
  updateRemoteStatus("Getrennt");
  rtc.songs = [];
  rtc.specials = { timeout: null, walkon: null, pauses: [] };
  renderSongs([]);
  renderSpecials();
  if (rtc.ui.answerOutput) rtc.ui.answerOutput.value = "";
  if (rtc.ui.offerInput) rtc.ui.offerInput.value = "";
  if (rtc.ui.answerQr) rtc.ui.answerQr.innerHTML = "";
  stopOfferScan();
  closeConnection();
}

function updateRemoteStatus(text) {
  if (rtc.ui.status) rtc.ui.status.textContent = text;
}

function logRemote(message) {
  const el = rtc.ui.log;
  if (!el) return;
  const ts = new Date().toLocaleTimeString();
  el.textContent = `[${ts}] ${message}\n${el.textContent}`.slice(0, 2000);
}

function closeConnection() {
  if (rtc.channel) {
    try {
      rtc.channel.close();
    } catch (e) {
      console.warn("channel close", e);
    }
  }
  if (rtc.pc) {
    try {
      rtc.pc.close();
    } catch (e) {
      console.warn("pc close", e);
    }
  }
  rtc.pc = null;
  rtc.channel = null;
  rtc.candidates = [];
  rtc.status = "disconnected";
}

async function connectWithOffer() {
  try {
    closeConnection();
    updateRemoteStatus("Verbinde...");
    logRemote("Offer wird verarbeitet...");
    const offerText = (rtc.ui.offerInput?.value || "").trim();
    if (!offerText) {
      logRemote("Kein Offer im Feld.");
      return;
    }
    const payload = decodeSignalPayload(offerText);
    if (!payload || payload.type !== "offer") {
      logRemote("Ungültiger Offer.");
      updateRemoteStatus("Fehler");
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: [] });
    rtc.pc = pc;
    pc.ondatachannel = (event) => {
      rtc.channel = event.channel;
      wireDataChannel(event.channel);
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) rtc.candidates.push(ev.candidate);
    };
    pc.oniceconnectionstatechange = () => logRemote(`ICE: ${pc.iceConnectionState}`);
    await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.type, sdp: payload.sdp }));
    if (Array.isArray(payload.ice)) {
      for (const cand of payload.ice) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn("ICE add failed", err);
        }
      }
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    const answerPayload = {
      type: "answer",
      sdp: pc.localDescription.sdp,
      ice: rtc.candidates,
    };
    const encoded = encodeSignalPayload(answerPayload);
    if (rtc.ui.answerOutput) rtc.ui.answerOutput.value = encoded;
    renderAnswerQr(encoded);
    updateRemoteStatus("Answer bereit");
    logRemote("Answer erstellt. QR/Text an den Player zeigen.");
  } catch (err) {
    console.error(err);
    logRemote(`Verbindungsfehler: ${err.message || err}`);
    updateRemoteStatus("Fehler");
  }
}

function wireDataChannel(channel) {
  channel.onopen = () => {
    updateRemoteStatus("Verbunden");
    logRemote("Channel offen. Songs werden angefragt...");
    sendCommand("requestSongs");
  };
  channel.onclose = () => {
    updateRemoteStatus("Getrennt");
    logRemote("Channel geschlossen.");
  };
  channel.onerror = (err) => logRemote(`Channel-Fehler: ${err?.message || err}`);
  channel.onmessage = handleMessage;
}

function handleMessage(event) {
  let msg = null;
  try {
    msg = JSON.parse(event.data);
  } catch (err) {
    console.warn("ungültige Nachricht", err);
    return;
  }
  if (!msg) return;
  if (msg.type === "songsList" && msg.data) {
    rtc.songs = msg.data.songs || [];
    rtc.specials = msg.data.specials || { pauses: [] };
    renderSongs(rtc.songs);
    renderSpecials();
    logRemote("Songs empfangen.");
  } else if (msg.type === "nowPlaying" && msg.data) {
    renderNowPlaying(msg.data);
  } else if (msg.type === "ack" && msg.command) {
    logRemote(`ACK: ${msg.command}`);
  }
}

function renderNowPlaying(data) {
  const stopped = data.stopped || !data.title;
  if (rtc.ui.nowPlaying) rtc.ui.nowPlaying.textContent = stopped ? "--" : data.title || "--";
  if (rtc.ui.nowCategory) rtc.ui.nowCategory.textContent = `Kategorie: ${stopped ? "--" : data.category || "--"}`;
}

function renderSongs(songList) {
  const container = rtc.ui.songSections;
  if (!container) return;
  container.innerHTML = "";
  remoteCategories.forEach((cat) => {
    const column = document.createElement("div");
    column.className = "bg-gray-700 rounded p-3 space-y-2";
    const title = document.createElement("div");
    title.className = "font-semibold text-sm";
    title.textContent = cat.title;
    column.appendChild(title);
    const list = document.createElement("div");
    list.className = "grid grid-cols-1 gap-2";
    const songs = songList.filter((s) => s.category === cat.key);
    songs.forEach((song) => {
      const btn = document.createElement("button");
      btn.className = `${cat.color} rounded px-3 py-2 text-left hover:opacity-80`;
      btn.textContent = song.display || song.id;
      btn.addEventListener("click", () => {
        sendCommand("play", { id: song.id, category: song.category });
      });
      list.appendChild(btn);
    });
    column.appendChild(list);
    container.appendChild(column);
  });
}

function renderSpecials() {
  const { timeoutBtn, walkonBtn, pausesContainer } = rtc.ui;
  if (timeoutBtn) {
    timeoutBtn.textContent = rtc.specials.timeout?.display || "Timeout";
  }
  if (walkonBtn) {
    walkonBtn.textContent = rtc.specials.walkon?.display || "Walk-On";
  }
  if (pausesContainer) {
    pausesContainer.innerHTML = "";
    const pauses = rtc.specials.pauses || [];
    pauses.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "bg-orange-500 hover:bg-orange-600 rounded px-2 py-2 text-sm";
      btn.textContent = p.display || `Pause ${p.number || ""}`;
      btn.addEventListener("click", () => sendCommand("special", { type: "pause", id: p.number || p.id }));
      pausesContainer.appendChild(btn);
    });
  }
}

function sendCommand(command, payload = {}) {
  if (!rtc.channel || rtc.channel.readyState !== "open") {
    logRemote("Nicht verbunden.");
    return;
  }
  try {
    rtc.channel.send(JSON.stringify({ type: "command", command, payload }));
  } catch (err) {
    console.warn("Senden fehlgeschlagen", err);
  }
}

function encodeSignalPayload(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSignalPayload(text) {
  const json = decodeURIComponent(escape(atob((text || "").trim())));
  return JSON.parse(json);
}

function waitForIce(pc) {
  return new Promise((resolve) => {
    if (!pc || pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const handler = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handler);
  });
}

function renderAnswerQr(text) {
  const target = rtc.ui.answerQr;
  if (!target) return;
  target.innerHTML = "";
  if (typeof QRCode === "undefined") {
    target.textContent = "QR-Bibliothek fehlt.";
    return;
  }
  new QRCode(target, { text, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.L });
}

async function startOfferScan() {
  const { video, canvas } = rtc.scanner;
  const { scanOfferBtn, stopOfferScanBtn } = rtc.ui;
  if (!video || !canvas) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    rtc.scanner.stream = stream;
    video.srcObject = stream;
    await video.play();
    video.classList.remove("hidden");
    if (scanOfferBtn) scanOfferBtn.classList.add("hidden");
    if (stopOfferScanBtn) stopOfferScanBtn.classList.remove("hidden");
    tickOfferScan();
    logRemote("Scanner gestartet.");
  } catch (err) {
    console.error(err);
    logRemote("Kamera/Scanner nicht verfügbar.");
  }
}

function tickOfferScan() {
  const { video, canvas, ctx } = rtc.scanner;
  if (!video || !canvas || !ctx) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== "undefined") {
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (code && code.data) {
        stopOfferScan();
        if (rtc.ui.offerInput) rtc.ui.offerInput.value = code.data;
        logRemote("Offer-QR gelesen.");
        return;
      }
    }
  }
  rtc.scanner.frameReq = requestAnimationFrame(tickOfferScan);
}

function stopOfferScan() {
  const { stream, frameReq, video } = rtc.scanner;
  const { scanOfferBtn, stopOfferScanBtn } = rtc.ui;
  if (frameReq) cancelAnimationFrame(frameReq);
  rtc.scanner.frameReq = null;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  rtc.scanner.stream = null;
  if (video) {
    video.pause();
    video.srcObject = null;
    video.classList.add("hidden");
  }
  if (scanOfferBtn) scanOfferBtn.classList.remove("hidden");
  if (stopOfferScanBtn) stopOfferScanBtn.classList.add("hidden");
}
