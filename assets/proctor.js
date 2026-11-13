// Exam proctoring: camera face check, tab/window switches, full screen, idle check-ins, copy/paste.
// The camera image never leaves the browser; only events (type, time, duration) are logged.
//
// How the camera check stays reliable:
// - The <video> lives in one hidden host on <body> and is never moved, so page changes can't pause it.
//   Previews are canvases copied from it (this also keeps video-speed and similar extensions off it).
// - A paused or frozen feed is restarted automatically; a camera that stops counts as "no face".
// - Face Landmarker gives head pose and eye direction (blendshapes), measured against a baseline
//   taken while the person looks at the screen on the pre-exam check. Eyes down = likely a phone.
// - Decisions use the last ~2 seconds of frames, so one good frame can't reset a warning.

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const LANDMARKER = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const DETECTOR = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
export const MAX_STRIKES = 5;
const TICK_MS = 250;
const WINDOW = 8;             // frames considered (~2 s)
const FACE_GRACE_MS = 3000;   // looking away / down / no face this long (after smoothing) → alarm
const MULTI_GRACE_MS = 2000;  // more than one face this long → alarm
const FROZEN_MS = 3000;       // no new camera frames this long → restart the camera
const AWAY_MIN_MS = 1500;     // shorter tab/window blips are ignored
const IDLE_MS = 90000;        // no mouse/keyboard/touch this long → check-in
const IDLE_ANSWER_MS = 20000; // check-in unanswered this long → strike
// Thresholds, relative to the person's own baseline
const YAW_DEG = 25, PITCH_DEG = 20, EYES_DOWN = 0.28, EYES_SIDE = 0.5;

const LABEL = {
  none: "No face in view", multi: "More than one face in view", side: "Looking away from the screen",
  down: "Looking down", ok: "Looking at the screen", loading: "Starting face check…", unavailable: "Face check unavailable",
  stopped: "Camera stopped",
};
const BAD = new Set(["none", "multi", "side", "down", "stopped"]);

let modelPromise = null;
function loadModel(cpu = false) {
  const make = async () => {
    const vision = await import(`${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const delegates = cpu ? ["CPU"] : ["GPU", "CPU"];
    for (const delegate of delegates) {
      try {
        const lm = await vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: LANDMARKER, delegate }, runningMode: "VIDEO", numFaces: 2,
          outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        return { kind: "landmarker", model: lm };
      } catch { /* try the next delegate */ }
    }
    for (const delegate of delegates) {
      try {
        const fd = await vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: DETECTOR, delegate }, runningMode: "VIDEO", minDetectionConfidence: 0.55 });
        return { kind: "detector", model: fd };
      } catch { /* try the next delegate */ }
    }
    throw new Error("face model unavailable");
  };
  if (cpu) return make();
  modelPromise ||= make();
  return modelPromise;
}

const deg = (r) => (r * 180) / Math.PI;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function readLandmarks(res) {
  const n = (res.faceLandmarks || []).length;
  if (!n) return { n: 0 };
  const m = res.facialTransformationMatrixes?.[0]?.data;
  let yaw = 0, pitch = 0;
  if (m && m.length >= 11) { yaw = deg(Math.asin(Math.max(-1, Math.min(1, -m[2])))); pitch = deg(Math.atan2(m[6], m[10])); }
  const bs = {}; (res.faceBlendshapes?.[0]?.categories || []).forEach((c) => { bs[c.categoryName] = c.score; });
  const down = ((bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0)) / 2;
  const side = Math.max(((bs.eyeLookOutLeft || 0) + (bs.eyeLookInRight || 0)) / 2, ((bs.eyeLookInLeft || 0) + (bs.eyeLookOutRight || 0)) / 2);
  return { n, yaw, pitch, down, side };
}
// Fallback when only the simple face detector loads: rough pose from six keypoints.
function readDetections(res) {
  const d = res.detections || [];
  if (!d.length) return { n: 0 };
  const k = d[0].keypoints || [];
  if (k.length < 4) return { n: d.length, yaw: 0, pitch: 0, down: 0, side: 0 };
  const [rEye, lEye, nose, mouth] = k;
  const eyeMidX = (rEye.x + lEye.x) / 2, eyeY = (rEye.y + lEye.y) / 2, eyeDist = Math.abs(lEye.x - rEye.x) || 0.0001;
  return { n: d.length, yaw: ((nose.x - eyeMidX) / eyeDist) * 60, pitch: ((nose.y - eyeY) / Math.max(0.0001, mouth.y - eyeY)) * 45, down: 0, side: 0 };
}

export class Proctor {
  constructor({ startedAt, initial = {}, onLog, onAutoSubmit }) {
    this.startedAt = startedAt;
    this.log = { strikes: initial.strikes || 0, tabAways: initial.tabAways || 0, pastes: initial.pastes || 0, events: (initial.events || []).slice(-150) };
    this.onLog = onLog; this.onAutoSubmit = onAutoSubmit;
    this.face = "loading"; this.camera = "off"; this.running = false; this.badSince = 0; this.modal = null;
    this.lastActivity = Date.now(); this.awayStart = 0; this.lastStrikeAt = 0; this.statusCbs = new Set();
    this.hist = []; this.samples = []; this.base = null; this.errors = 0;
    this.lastFrameT = -1; this.lastFrameAt = Date.now(); this.lastRestart = 0;
    this.previews = new Set();
    // One hidden, never-moved video element. Kept tiny and nearly transparent rather than display:none,
    // so the browser keeps decoding frames.
    let host = document.getElementById("cam-host");
    if (!host) { host = document.createElement("div"); host.id = "cam-host"; host.setAttribute("aria-hidden", "true"); host.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;overflow:hidden;pointer-events:none;z-index:-1"; document.body.appendChild(host); }
    host.replaceChildren();
    this.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, autoplay: true });
    this.video.setAttribute("playsinline", ""); this.video.setAttribute("muted", "");
    host.appendChild(this.video);
    this.bound = {};
  }

  /* ---------- camera ---------- */
  async openStream() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
    this.video.srcObject = this.stream; await this.video.play().catch(() => {});
    this.lastFrameAt = Date.now(); this.lastFrameT = -1;
    this.stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (this.stopped) return;
      this.camera = "stopped"; this.setFace("stopped");
      if (this.running) this.record("camera-stopped", "Camera was turned off or disconnected");
      this.restartCamera("ended");
    });
  }
  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { this.camera = "unsupported"; this.emit(); return false; }
    try {
      this.stopped = false;
      await this.openStream();
      this.camera = "ok"; this.emit(); this.drawLoop();
      loadModel().then((m) => { this.model = m; if (this.face === "loading") this.setFace("none"); this.tick(); })
        .catch(() => { this.setFace("unavailable"); this.tick(); });
      return true;
    } catch (e) {
      this.camera = e && e.name === "NotAllowedError" ? "denied" : "error"; this.emit(); return false;
    }
  }
  async restartCamera(reason) {
    if (this.stopped || Date.now() - this.lastRestart < 8000) return;
    this.lastRestart = Date.now();
    if (this.running) this.record("camera-restart", reason === "frozen" ? "Camera feed froze; restarting it" : "Restarting the camera");
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
    try { await this.openStream(); this.camera = "ok"; this.emit(); }
    catch { this.camera = "stopped"; this.setFace("stopped"); }
  }
  /** Copies the hidden video into a canvas inside `container` (pre-exam check, dock, alarm). */
  attachPreview(container) {
    if (!container) return;
    container.querySelector("canvas.cam-video")?.remove();
    const c = document.createElement("canvas"); c.className = "cam-video"; c.width = 320; c.height = 240;
    container.prepend(c); this.previews.add(c);
  }
  drawLoop() {
    cancelAnimationFrame(this.rafId);
    const draw = () => {
      if (this.stopped) return;
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth) {
        for (const c of this.previews) {
          if (!c.isConnected) { this.previews.delete(c); continue; }
          if (c.width !== v.videoWidth / 2) { c.width = v.videoWidth / 2; c.height = v.videoHeight / 2; }
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        }
      }
      this.rafId = requestAnimationFrame(draw);
    };
    draw();
  }
  checkFeed() {
    const v = this.video;
    if (this.camera !== "ok") return;
    if (v.paused) v.play().catch(() => {});
    if (v.currentTime !== this.lastFrameT) { this.lastFrameT = v.currentTime; this.lastFrameAt = Date.now(); return; }
    // Hidden tabs throttle video; only treat a stall as frozen while the page is visible.
    if (!document.hidden && Date.now() - this.lastFrameAt > FROZEN_MS) this.restartCamera("frozen");
  }

  tick() {
    clearTimeout(this.tickT);
    if (this.stopped) return;
    this.checkFeed();
    if (this.camera !== "ok") { this.push("stopped"); }
    else if (this.model && this.video.readyState >= 2 && this.video.videoWidth) {
      try {
        const res = this.model.kind === "landmarker" ? this.model.model.detectForVideo(this.video, performance.now()) : this.model.model.detectForVideo(this.video, performance.now());
        this.errors = 0;
        this.push(this.classify(this.model.kind === "landmarker" ? readLandmarks(res) : readDetections(res)));
      } catch (e) {
        if (++this.errors === 8) {
          // GPU context lost or similar: rebuild on the CPU once, then give up visibly.
          loadModel(true).then((m) => { this.model = m; this.errors = 0; }).catch(() => { this.setFace("unavailable"); if (this.running) this.record("face-check-failed", "The face check stopped working"); });
        }
      }
    }
    this.watchFace();
    this.tickT = setTimeout(() => this.tick(), TICK_MS);
  }
  classify(r) {
    if (!r.n) return "none";
    if (r.n > 1) return "multi";
    // Baseline: while not yet running, learn how this person looks at the screen (camera is often above it).
    const loose = Math.abs(r.yaw) < 30 && Math.abs(r.pitch) < 30 && r.side < EYES_SIDE + 0.1;
    if (!this.running && loose) {
      this.samples.push(r); if (this.samples.length > 20) this.samples.shift();
      this.base = { yaw: median(this.samples.map((s) => s.yaw)), pitch: median(this.samples.map((s) => s.pitch)), down: median(this.samples.map((s) => s.down)) };
    }
    const b = this.base || { yaw: 0, pitch: 0, down: 0.15 };
    const dy = r.yaw - b.yaw, dp = r.pitch - b.pitch, dDown = r.down - b.down;
    let f = "ok";
    if (Math.abs(dy) > YAW_DEG || r.side > EYES_SIDE) f = "side";
    else if (dDown > EYES_DOWN) f = "down";
    else if (Math.abs(dp) > PITCH_DEG) f = r.down > b.down + 0.12 ? "down" : "side";
    // Slow drift with posture during the test, only from good frames.
    if (this.running && f === "ok" && this.base) { const a = 0.01; this.base = { yaw: b.yaw + a * dy, pitch: b.pitch + a * dp, down: b.down + a * dDown }; }
    return f;
  }
  push(f) {
    this.hist.push(f); if (this.hist.length > WINDOW) this.hist.shift();
    const bad = this.hist.filter((x) => BAD.has(x));
    let state = this.face === "loading" ? f : this.face;
    if (this.hist.length < 3) state = f;
    else if (bad.length >= Math.ceil(WINDOW * 0.6) || (this.hist.length < WINDOW && bad.length >= this.hist.length - 1)) {
      const counts = {}; bad.forEach((x) => (counts[x] = (counts[x] || 0) + 1));
      state = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    } else if (this.hist.length - bad.length >= Math.ceil(WINDOW * 0.75)) state = "ok";
    if (this.face === "unavailable" && state !== "stopped") return;
    this.setFace(state);
  }
  setFace(f) { if (f !== this.face) { this.face = f; this.emit(); } }
  onStatus(cb) { this.statusCbs.add(cb); cb(this.status()); return () => this.statusCbs.delete(cb); }
  status() { return { camera: this.camera, face: this.face, label: LABEL[this.face] || "", strikes: this.log.strikes }; }
  emit() { const s = this.status(); this.statusCbs.forEach((cb) => cb(s)); this.paintDock(); if (this.modal?.kind === "face") this.paintFaceModal(); }
  ready() { return this.camera === "ok" && (this.face === "ok" || this.face === "unavailable"); }

  /* ---------- monitoring ---------- */
  begin() {
    if (this.running) return;
    this.running = true; this.lastActivity = Date.now(); this.badSince = 0;
    this.mountDock();
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); (this.offs ||= []).push(() => t.removeEventListener(ev, fn, opt)); };
    const activity = () => { this.lastActivity = Date.now(); };
    ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((ev) => on(window, ev, activity, { passive: true }));
    on(document, "visibilitychange", () => this.awayCheck());
    on(window, "blur", () => this.awayCheck());
    on(window, "focus", () => this.awayCheck());
    on(document, "fullscreenchange", () => this.fsCheck());
    on(document, "copy", (e) => { e.preventDefault(); this.record("copy-blocked", "Tried to copy"); });
    on(document, "cut", (e) => { e.preventDefault(); this.record("copy-blocked", "Tried to cut"); });
    on(document, "contextmenu", (e) => e.preventDefault());
    on(document, "paste", (e) => { e.preventDefault(); this.log.pastes++; this.record("paste-blocked", "Tried to paste"); });
    this.idleT = setInterval(() => this.idleCheck(), 5000);
    if (this.video.paused) this.video.play().catch(() => {});
    this.record("start", `Assessment started with camera ${this.camera}${this.model ? "" : " (face check still loading)"}`);
  }
  stop() {
    this.running = false; this.stopped = true;
    (this.offs || []).forEach((f) => f()); this.offs = [];
    clearInterval(this.idleT); clearTimeout(this.tickT); clearInterval(this.beepT); cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    this.video.srcObject = null; this.previews.clear();
    this.closeModal(); document.getElementById("cam-dock")?.remove();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  elapsed() { return Math.max(0, Math.round((Date.now() - new Date(this.startedAt).getTime()) / 1000)); }
  record(type, detail, extra = {}) {
    this.log.events.push({ t: this.elapsed(), type, detail, ...extra });
    if (this.log.events.length > 150) this.log.events.shift();
    this.onLog?.(this.log);
  }
  strike(type, detail, extra) {
    const now = Date.now();
    if (now - this.lastStrikeAt < 3000) { this.record(type, detail, { ...extra, merged: true }); return; }
    this.lastStrikeAt = now; this.log.strikes++;
    this.record(type, detail, { ...extra, strike: this.log.strikes });
    this.paintDock();
    if (this.log.strikes >= MAX_STRIKES) { this.showModal("final", { title: "Test submitted", body: `You reached ${MAX_STRIKES} strikes, so the assessment was submitted automatically. Your manager can see what happened.` }); setTimeout(() => this.onAutoSubmit?.(), 1800); }
  }

  watchFace() {
    if (!this.running || this.face === "unavailable" || this.face === "loading") return;
    if (!BAD.has(this.face)) { this.badSince = 0; return; }
    if (!this.badSince) { this.badSince = Date.now(); return; }
    const grace = this.face === "multi" ? MULTI_GRACE_MS : FACE_GRACE_MS;
    if (Date.now() - this.badSince >= grace && !this.modal) {
      const secs = Math.round((Date.now() - this.badSince) / 1000);
      this.strike("face-" + this.face, `${LABEL[this.face]} for ${secs} seconds`, { dur: secs });
      if (this.running && this.log.strikes < MAX_STRIKES) this.showModal("face");
    }
  }
  awayCheck() {
    if (!this.running) return;
    const away = document.hidden || !document.hasFocus();
    if (away && !this.awayStart) { this.awayStart = Date.now(); return; }
    if (!away && this.awayStart) {
      const ms = Date.now() - this.awayStart; this.awayStart = 0;
      if (ms < AWAY_MIN_MS) return;
      const secs = Math.round(ms / 1000);
      this.log.tabAways++;
      this.strike("left-page", `Left the test page for ${secs} second${secs === 1 ? "" : "s"}`, { dur: secs });
      if (this.running && !this.modal && this.log.strikes < MAX_STRIKES) this.showModal("away", { secs });
    }
  }
  fsCheck() {
    if (!this.running || !document.fullscreenEnabled) return;
    if (!document.fullscreenElement) {
      this.strike("fullscreen-exit", "Left full screen");
      if (this.running && !this.modal && this.log.strikes < MAX_STRIKES) this.showModal("fullscreen");
    }
  }
  idleCheck() {
    if (!this.running || this.modal) return;
    if (Date.now() - this.lastActivity < IDLE_MS) return;
    this.record("idle", `No activity for ${Math.round(IDLE_MS / 1000)} seconds`);
    this.showModal("idle");
    this.idleDeadline = setTimeout(() => {
      if (this.modal?.kind === "idle") { this.strike("idle-unanswered", "Didn't answer the check-in"); this.closeModal(); this.lastActivity = Date.now(); }
    }, IDLE_ANSWER_MS);
  }
  static async enterFullscreen() { try { if (document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch { /* not allowed here */ } }

  /* ---------- UI owned by the proctor (outside #app so re-renders don't remove it) ---------- */
  mountDock() {
    let d = document.getElementById("cam-dock");
    if (!d) { d = document.createElement("div"); d.id = "cam-dock"; d.className = "cam-dock"; d.innerHTML = `<div class="cam-frame"></div><div class="cam-meta"><span class="cam-dot"></span><span class="cam-label"></span><span class="cam-strikes"></span></div>`; document.body.appendChild(d); }
    if (!d.querySelector("canvas.cam-video")) this.attachPreview(d.querySelector(".cam-frame"));
    this.paintDock();
  }
  paintDock() {
    const d = document.getElementById("cam-dock"); if (!d) return;
    const bad = this.camera !== "ok" || BAD.has(this.face);
    d.classList.toggle("bad", bad);
    d.querySelector(".cam-label").textContent = this.camera !== "ok" ? "Camera off" : LABEL[this.face];
    d.querySelector(".cam-strikes").textContent = `${this.log.strikes}/${MAX_STRIKES} strikes`;
  }
  beep(on) {
    clearInterval(this.beepT);
    if (!on) return;
    const play = () => { try { this.ac ||= new AudioContext(); this.ac.resume?.(); const o = this.ac.createOscillator(), g = this.ac.createGain(); o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, this.ac.currentTime); g.gain.exponentialRampToValueAtTime(0.2, this.ac.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, this.ac.currentTime + 0.35); o.connect(g).connect(this.ac.destination); o.start(); o.stop(this.ac.currentTime + 0.4); } catch { /* audio blocked */ } };
    play(); this.beepT = setInterval(play, 1300);
  }
  closeModal() { clearTimeout(this.idleDeadline); this.beep(false); this.modal?.el.remove(); this.modal = null; }
  showModal(kind, data = {}) {
    this.closeModal();
    const el = document.createElement("div"); el.className = "proctor-back"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true");
    const strikes = `<div class="strike-row" aria-label="${this.log.strikes} of ${MAX_STRIKES} strikes">${Array.from({ length: MAX_STRIKES }, (_, i) => `<i class="${i < this.log.strikes ? "on" : ""}"></i>`).join("")}<span>Strike ${this.log.strikes} of ${MAX_STRIKES}</span></div>`;
    const icon = `<span class="pm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 2 20h20zM12 10v4M12 17h.01"/></svg></span>`;
    const box = (title, sub, body, btn) => `<div class="proctor-modal"><div class="row" style="gap:12px;flex-wrap:nowrap">${icon}<div><div class="pm-title" id="pm-title">${title}</div><div class="pm-sub">${sub}</div></div></div>${body}${btn}</div>`;
    if (kind === "face") {
      el.innerHTML = box("Look at the screen", "Face the camera to continue.", `<div class="pm-cam"></div><div class="pm-state"></div>${strikes}<p class="pm-p">This was logged for your manager. At ${MAX_STRIKES} strikes the test submits itself.</p>`, `<div class="row"><button class="btn primary lg" data-pm="continue" disabled>I'm back. Continue</button><button class="btn" data-pm="cam" hidden>Restart camera</button></div>`);
      this.beep(true);
    } else if (kind === "away") {
      el.innerHTML = box("You left the test page", `Away for ${data.secs} seconds.`, `${strikes}<p class="pm-p">Stay on this page until you submit. Switching tabs, apps or windows is logged.</p>`, `<button class="btn primary lg" data-pm="ok">Back to my test</button>`);
    } else if (kind === "fullscreen") {
      el.innerHTML = box("Return to full screen", "The test runs in full screen.", `${strikes}<p class="pm-p">Leaving full screen is logged. Go back to continue.</p>`, `<button class="btn primary lg" data-pm="fs">Return to full screen</button>`);
    } else if (kind === "idle") {
      el.innerHTML = box("Are you still there?", `No activity for ${Math.round(IDLE_MS / 1000)} seconds.`, `<p class="pm-p">Click below within ${Math.round(IDLE_ANSWER_MS / 1000)} seconds, or it counts as a strike.</p>`, `<button class="btn primary lg" data-pm="ok">I'm here</button>`);
      this.beep(true);
    } else if (kind === "final") {
      el.innerHTML = box(data.title, "", `<p class="pm-p">${data.body}</p>`, "");
    }
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-pm]"); if (!b) return;
      if (b.dataset.pm === "cam") { this.lastRestart = 0; await this.restartCamera("manual"); return; }
      if (b.dataset.pm === "fs") await Proctor.enterFullscreen();
      if (b.dataset.pm === "continue" && BAD.has(this.face)) return;
      this.lastActivity = Date.now(); this.badSince = 0; this.hist = []; this.closeModal(); this.mountDock();
    });
    document.body.appendChild(el);
    this.modal = { kind, el };
    if (kind === "face") { this.attachPreview(el.querySelector(".pm-cam")); this.paintFaceModal(); }
    el.querySelector("[data-pm]")?.focus();
  }
  paintFaceModal() {
    const el = this.modal?.el; if (!el) return;
    const ok = !BAD.has(this.face);
    el.querySelector(".pm-state").textContent = this.camera !== "ok" ? "Camera stopped. Check it's connected, then restart it." : LABEL[this.face] || "";
    el.querySelector(".pm-state").className = "pm-state " + (ok ? "ok" : "bad");
    el.querySelector(".pm-cam").classList.toggle("ok", ok);
    const btn = el.querySelector('[data-pm="continue"]'); if (btn) btn.disabled = !ok;
    const cam = el.querySelector('[data-pm="cam"]'); if (cam) cam.hidden = this.camera === "ok";
    this.beep(!ok);
  }
}
