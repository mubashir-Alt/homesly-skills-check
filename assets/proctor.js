// Exam proctoring: camera face check, tab/window switches, full screen, idle check-ins, copy/paste.
// The camera image never leaves the browser; only events (type, time, duration) are logged.

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
export const MAX_STRIKES = 5;
const FACE_GRACE_MS = 5000;   // face missing / looking away this long → alarm
const MULTI_GRACE_MS = 3000;  // more than one face this long → alarm
const AWAY_MIN_MS = 1500;     // shorter tab/window blips are ignored
const IDLE_MS = 90000;        // no mouse/keyboard/touch this long → check-in
const IDLE_ANSWER_MS = 20000; // check-in unanswered this long → strike

const LABEL = {
  none: "No face in view", multi: "More than one face in view", side: "Looking away from the screen",
  down: "Looking down", ok: "Looking at the screen", loading: "Starting face check…", unavailable: "Face check unavailable",
};

let detectorPromise = null;
function loadDetector() {
  detectorPromise ||= (async () => {
    const vision = await import(`${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    try {
      return await vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: "GPU" }, runningMode: "VIDEO", minDetectionConfidence: 0.55 });
    } catch {
      return await vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "VIDEO", minDetectionConfidence: 0.55 });
    }
  })();
  return detectorPromise;
}

function classify(dets) {
  if (!dets.length) return "none";
  if (dets.length > 1) return "multi";
  const k = dets[0].keypoints || [];
  if (k.length < 4) return "ok";
  const [rEye, lEye, nose, mouth] = k;
  const eyeMidX = (rEye.x + lEye.x) / 2, eyeY = (rEye.y + lEye.y) / 2, eyeDist = Math.abs(lEye.x - rEye.x) || 0.0001;
  const yaw = (nose.x - eyeMidX) / eyeDist;
  const pitch = (nose.y - eyeY) / Math.max(0.0001, mouth.y - eyeY);
  if (Math.abs(yaw) > 0.6) return "side";
  if (pitch > 0.82) return "down";
  return "ok";
}

export class Proctor {
  constructor({ startedAt, initial = {}, onLog, onAutoSubmit }) {
    this.startedAt = startedAt;
    this.log = { strikes: initial.strikes || 0, tabAways: initial.tabAways || 0, pastes: initial.pastes || 0, events: (initial.events || []).slice(-150) };
    this.onLog = onLog; this.onAutoSubmit = onAutoSubmit;
    this.face = "loading"; this.camera = "off"; this.running = false; this.badSince = 0; this.modal = null;
    this.lastActivity = Date.now(); this.awayStart = 0; this.lastStrikeAt = 0; this.statusCbs = new Set();
    this.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, autoplay: true });
    this.video.setAttribute("playsinline", ""); this.video.className = "cam-video";
    this.bound = {};
  }

  /* ---------- camera ---------- */
  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { this.camera = "unsupported"; this.emit(); return false; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      this.video.srcObject = this.stream; await this.video.play().catch(() => {});
      this.camera = "ok"; this.emit();
      this.stream.getVideoTracks()[0]?.addEventListener("ended", () => { this.camera = "stopped"; this.face = "none"; this.emit(); if (this.running) this.record("camera-stopped", "Camera was turned off"); });
      loadDetector().then((d) => { this.detector = d; this.face = "none"; this.emit(); this.tick(); }).catch(() => { this.face = "unavailable"; this.emit(); });
      return true;
    } catch (e) {
      this.camera = e && e.name === "NotAllowedError" ? "denied" : "error"; this.emit(); return false;
    }
  }
  tick() {
    clearTimeout(this.tickT);
    if (!this.detector || !this.stream) return;
    if (this.video.readyState >= 2) {
      try {
        const res = this.detector.detectForVideo(this.video, performance.now());
        const f = classify(res.detections || []);
        if (f !== this.face) { this.face = f; this.emit(); }
        this.watchFace();
      } catch { /* a dropped frame */ }
    }
    this.tickT = setTimeout(() => this.tick(), 350);
  }
  onStatus(cb) { this.statusCbs.add(cb); cb(this.status()); return () => this.statusCbs.delete(cb); }
  status() { return { camera: this.camera, face: this.face, label: LABEL[this.face] || "", strikes: this.log.strikes }; }
  emit() { const s = this.status(); this.statusCbs.forEach((cb) => cb(s)); this.paintDock(); if (this.modal?.kind === "face") this.paintFaceModal(); }
  ready() { return this.camera === "ok" && (this.face === "ok" || this.face === "unavailable"); }

  /* ---------- monitoring ---------- */
  begin() {
    if (this.running) return;
    this.running = true; this.lastActivity = Date.now();
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
    this.record("start", "Assessment started with camera " + this.camera);
  }
  stop() {
    this.running = false;
    (this.offs || []).forEach((f) => f()); this.offs = [];
    clearInterval(this.idleT); clearTimeout(this.tickT); clearInterval(this.beepT);
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
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
    if (!this.running || this.face === "unavailable") return;
    const bad = this.face !== "ok";
    if (!bad) { this.badSince = 0; return; }
    if (!this.badSince) { this.badSince = Date.now(); return; }
    const grace = this.face === "multi" ? MULTI_GRACE_MS : FACE_GRACE_MS;
    if (Date.now() - this.badSince >= grace && !this.modal) {
      const secs = Math.round((Date.now() - this.badSince) / 1000);
      this.strike("face-" + this.face, `${LABEL[this.face]} for ${secs} seconds`, { dur: secs });
      if (this.running) this.showModal("face");
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
      if (this.running && !this.modal) this.showModal("away", { secs });
    }
  }
  fsCheck() {
    if (!this.running || !document.fullscreenEnabled) return;
    if (!document.fullscreenElement) {
      this.strike("fullscreen-exit", "Left full screen");
      if (this.running && !this.modal) this.showModal("fullscreen");
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
    d.querySelector(".cam-frame").appendChild(this.video);
    this.paintDock();
  }
  paintDock() {
    const d = document.getElementById("cam-dock"); if (!d) return;
    const bad = this.camera !== "ok" || (this.face !== "ok" && this.face !== "unavailable" && this.face !== "loading");
    d.classList.toggle("bad", bad);
    d.querySelector(".cam-label").textContent = this.camera !== "ok" ? "Camera off" : LABEL[this.face];
    d.querySelector(".cam-strikes").textContent = `${this.log.strikes}/${MAX_STRIKES} strikes`;
  }
  beep(on) {
    clearInterval(this.beepT);
    if (!on) return;
    const play = () => { try { this.ac ||= new AudioContext(); const o = this.ac.createOscillator(), g = this.ac.createGain(); o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, this.ac.currentTime); g.gain.exponentialRampToValueAtTime(0.2, this.ac.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, this.ac.currentTime + 0.35); o.connect(g).connect(this.ac.destination); o.start(); o.stop(this.ac.currentTime + 0.4); } catch { /* audio blocked */ } };
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
      el.innerHTML = box("Look at the screen", "Face the camera to continue.", `<div class="pm-cam"></div><div class="pm-state"></div>${strikes}<p class="pm-p">This was logged for your manager. At ${MAX_STRIKES} strikes the test submits itself.</p>`, `<button class="btn primary lg" data-pm="continue" disabled>I'm back. Continue</button>`);
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
      if (b.dataset.pm === "fs") await Proctor.enterFullscreen();
      if (b.dataset.pm === "continue" && !(this.face === "ok" || this.face === "unavailable")) return;
      this.lastActivity = Date.now(); this.badSince = 0; this.closeModal(); this.mountDock();
    });
    document.body.appendChild(el);
    this.modal = { kind, el };
    if (kind === "face") { el.querySelector(".pm-cam").appendChild(this.video); this.paintFaceModal(); }
    el.querySelector("[data-pm]")?.focus();
  }
  paintFaceModal() {
    const el = this.modal?.el; if (!el) return;
    const ok = this.face === "ok" || this.face === "unavailable";
    el.querySelector(".pm-state").textContent = LABEL[this.face] || "";
    el.querySelector(".pm-state").className = "pm-state " + (ok ? "ok" : "bad");
    el.querySelector(".pm-cam").classList.toggle("ok", ok);
    const btn = el.querySelector('[data-pm="continue"]'); if (btn) btn.disabled = !ok;
    this.beep(!ok);
  }
}
