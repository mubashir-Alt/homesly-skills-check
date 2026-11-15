// Hiring Part A evidence capture: whole-screen sharing plus still images.
// - Camera stills every 30 s, screen stills every 60 s, and both at once on every warning.
// - The candidate must share their ENTIRE screen (not a tab or window); if sharing stops, Part A pauses
//   behind a "share again" screen and a strike is logged.
// - Images are small JPEGs, uploaded one at a time to private storage through signed upload URLs.
//   Nothing is uploaded before Part A starts, and capture stops the moment it is submitted.

const CAM_EVERY_MS = 30_000;
const SCREEN_EVERY_MS = 60_000;
const CAM_W = 480, SCREEN_W = 1280;

export class Capture {
  /** @param {{ proctor: any, upload: (kind:string, reason:string, t:number, blob:Blob) => Promise<void> }} o */
  constructor({ proctor, upload }) {
    this.pr = proctor; this.upload = upload;
    this.screen = null; this.screenVideo = null; this.queue = []; this.busy = false; this.timers = []; this.running = false;
    this.sent = 0; this.failed = 0;
  }

  static supported() { return !!navigator.mediaDevices?.getDisplayMedia; }

  /** Ask for the whole screen. Returns null on success or a message to show. */
  async shareScreen() {
    if (!Capture.supported()) return "Screen sharing isn't available in this browser. Use Chrome or Edge on a laptop or desktop computer.";
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: { ideal: 5, max: 10 } }, audio: false, monitorTypeSurfaces: "include", selfBrowserSurface: "include", surfaceSwitching: "exclude" });
    } catch (e) {
      return e?.name === "NotAllowedError" ? "Screen sharing was cancelled. Click again and choose Entire screen." : "Screen sharing couldn't start. Try again, or use Chrome or Edge.";
    }
    const track = stream.getVideoTracks()[0];
    const surface = track?.getSettings?.().displaySurface;
    if (surface && surface !== "monitor") {
      stream.getTracks().forEach((t) => t.stop());
      return `You shared a ${surface === "browser" ? "browser tab" : "single window"}. Please choose "Entire screen" instead.`;
    }
    this.stopScreen();
    this.screen = stream;
    this.screenVideo = Object.assign(document.createElement("video"), { muted: true, playsInline: true, autoplay: true });
    this.screenVideo.srcObject = stream; await this.screenVideo.play().catch(() => {});
    track.addEventListener("ended", () => this.onScreenEnded());
    if (this.running) this.pr.record("screen-shared", "Whole screen shared again");
    return null;
  }
  screenOk() { return !!this.screen && this.screen.getVideoTracks().some((t) => t.readyState === "live"); }
  onScreenEnded() {
    this.screen = null;
    if (!this.running) { this.onChange?.(); return; }
    this.pr.strike("screen-stopped", "Stopped sharing the screen");
    if (this.pr.running && this.pr.log.strikes < 5) this.pr.showModal("screen");
    this.onChange?.();
  }

  begin() {
    this.running = true;
    this.timers.push(setInterval(() => this.snap("cam", "interval"), CAM_EVERY_MS));
    this.timers.push(setInterval(() => this.snap("screen", "interval"), SCREEN_EVERY_MS));
    setTimeout(() => { this.snap("cam", "start"); this.snap("screen", "start"); }, 1500);
  }
  /** Called for every proctor event: warnings get an immediate camera + screen still. */
  onEvent(e) {
    if (!this.running || !e) return;
    if (e.strike || e.merged || /^face-|left-page|fullscreen|screen-stopped|paste|copy/.test(e.type)) {
      const why = String(e.detail || e.type).slice(0, 100);
      this.snap("cam", why); this.snap("screen", why);
    }
  }
  stop() {
    this.running = false; this.timers.forEach(clearInterval); this.timers = [];
    this.stopScreen();
  }
  stopScreen() {
    const s = this.screen; this.screen = null;
    if (s) s.getTracks().forEach((t) => t.stop()); // stop() itself never fires "ended"
    if (this.screenVideo) { this.screenVideo.srcObject = null; this.screenVideo = null; }
  }

  frame(kind) {
    const v = kind === "cam" ? this.pr.video : this.screenVideo;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    const w = Math.min(kind === "cam" ? CAM_W : SCREEN_W, v.videoWidth), hgt = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement("canvas"); c.width = w; c.height = hgt;
    c.getContext("2d").drawImage(v, 0, 0, w, hgt);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", kind === "cam" ? 0.7 : 0.6));
  }
  async snap(kind, reason) {
    if (!this.running) return;
    const p = this.frame(kind); if (!p) return;
    const blob = await p; if (!blob) return;
    this.queue.push({ kind, reason, t: this.pr.elapsed(), blob, tries: 0 });
    if (this.queue.length > 40) this.queue.splice(0, this.queue.length - 40); // keep memory bounded on bad connections
    this.drain();
  }
  async drain() {
    if (this.busy) return; this.busy = true;
    while (this.queue.length) {
      const item = this.queue[0];
      try { await this.upload(item.kind, item.reason, item.t, item.blob); this.queue.shift(); this.sent++; }
      catch { item.tries++; if (item.tries >= 3) { this.queue.shift(); this.failed++; } else await new Promise((r) => setTimeout(r, 2000 * item.tries)); }
    }
    this.busy = false;
  }
  /** Give pending uploads a moment to finish before submitting. */
  async flush(ms = 6000) { const end = Date.now() + ms; while ((this.queue.length || this.busy) && Date.now() < end) await new Promise((r) => setTimeout(r, 200)); }
}
