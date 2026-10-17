/* Lecteur d'animations (canvas) et export vidéo (MP4 H.264 si disponible, sinon WebM) — navigateur / Electron uniquement. */
(function (root) {
  "use strict";
  const E = root.FutsalAnim;
  const SC = root.FutsalScenes;
  const W = 1280, H = 800;

  /* ---- Lecteur ---- */
  function ScenePlayer(canvas, handlers) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.handlers = handlers || {};
    this.seq = null;
    this.T = 0;
    this.rate = 1;
    this.playing = false;
    this.raf = 0;
    this.last = 0;
    this.loop = false;
    canvas.width = W; canvas.height = H;
    this._tick = this._tick.bind(this);
  }
  ScenePlayer.prototype.setSequence = function (seq) {
    this.pause();
    this.seq = seq; this.T = 0;
    this.render();
    if (this.handlers.onTime) this.handlers.onTime(0, seq ? seq.duration : 0, false);
  };
  ScenePlayer.prototype.render = function () {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!this.seq) return;
    E.drawOps(ctx, SC.sequenceOps(this.seq, this.T), W / E.VIEW.w);
  };
  ScenePlayer.prototype._tick = function (now) {
    if (!this.playing) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.T += dt * this.rate;
    if (this.T >= this.seq.duration) {
      if (this.loop) this.T = 0;
      else { this.T = this.seq.duration; this.playing = false; this.render(); if (this.handlers.onEnd) this.handlers.onEnd(); if (this.handlers.onTime) this.handlers.onTime(this.T, this.seq.duration, false); return; }
    }
    this.render();
    if (this.handlers.onTime) this.handlers.onTime(this.T, this.seq.duration, true);
    this.raf = requestAnimationFrame(this._tick);
  };
  ScenePlayer.prototype.play = function () {
    if (!this.seq || this.playing) return;
    if (this.T >= this.seq.duration) this.T = 0;
    this.playing = true; this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  };
  ScenePlayer.prototype.pause = function () {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.handlers.onTime && this.seq) this.handlers.onTime(this.T, this.seq.duration, false);
  };
  ScenePlayer.prototype.seek = function (T) {
    if (!this.seq) return;
    this.T = Math.max(0, Math.min(this.seq.duration, T));
    this.render();
    if (this.handlers.onTime) this.handlers.onTime(this.T, this.seq.duration, this.playing);
  };

  /* ---- Export vidéo : rendu image par image (plus rapide que le temps réel) puis encodage WebCodecs ---- */
  const H264 = ["avc1.640028", "avc1.4d0028", "avc1.42001f", "avc1.420028"];
  const VP9 = ["vp09.00.40.08", "vp09.00.10.08"];

  async function pickCodec(width, height, fps) {
    if (typeof VideoEncoder === "undefined") return null;
    const base = { width, height, bitrate: 6000000, framerate: fps };
    for (const c of H264) {
      try { const s = await VideoEncoder.isConfigSupported(Object.assign({ codec: c }, base)); if (s.supported) return { kind: "mp4", codec: c }; } catch (_e) { /* essai suivant */ }
    }
    for (const c of VP9.concat(["vp8"])) {
      try { const s = await VideoEncoder.isConfigSupported(Object.assign({ codec: c }, base)); if (s.supported) return { kind: "webm", codec: c }; } catch (_e) { /* essai suivant */ }
    }
    return null;
  }

  /* seq : séquence du registre ; opts : { fps, onProgress(0..1), signal } -> { buffer, ext, codec } */
  async function exportVideo(seq, opts) {
    opts = opts || {};
    const fps = opts.fps || 30;
    const pick = await pickCodec(W, H, fps);
    if (!pick) throw new Error("Aucun encodeur vidéo disponible sur cet ordinateur.");
    const mux = pick.kind === "mp4"
      ? new root.Mp4Muxer.Muxer({ target: new root.Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: W, height: H, frameRate: fps }, fastStart: "in-memory" })
      : new root.WebMMuxer.Muxer({ target: new root.WebMMuxer.ArrayBufferTarget(), video: { codec: pick.codec === "vp8" ? "V_VP8" : "V_VP9", width: W, height: H, frameRate: fps } });
    let encError = null;
    const encoder = new VideoEncoder({ output: (chunk, meta) => mux.addVideoChunk(chunk, meta), error: (e) => { encError = e; } });
    encoder.configure({ codec: pick.codec, width: W, height: H, bitrate: 6000000, framerate: fps });
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const total = Math.ceil(seq.duration * fps) + 1;
    for (let i = 0; i < total; i++) {
      if (opts.signal && opts.signal.aborted) { encoder.close(); throw new Error("Export interrompu"); }
      if (encError) throw new Error("Erreur d'encodage : " + encError.message);
      ctx.clearRect(0, 0, W, H);
      E.drawOps(ctx, SC.sequenceOps(seq, Math.min(seq.duration, i / fps)), W / E.VIEW.w);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1000000) / fps), duration: Math.round(1000000 / fps) });
      encoder.encode(frame, { keyFrame: i % 60 === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 12) await new Promise((r) => setTimeout(r, 4));
      if (opts.onProgress && i % 5 === 0) { opts.onProgress(i / total); await new Promise((r) => setTimeout(r, 0)); }
    }
    await encoder.flush();
    encoder.close();
    if (encError) throw new Error("Erreur d'encodage : " + encError.message);
    mux.finalize();
    if (opts.onProgress) opts.onProgress(1);
    return { buffer: mux.target.buffer, ext: pick.kind, codec: pick.codec };
  }

  /* Encode une suite d'images fournie par o.renderFrame(i) (canvas à la taille width × height) :
     o : { width, height, fps, total, renderFrame(i) -> canvas, onProgress(0..1), signal } -> { buffer, ext, codec } */
  async function encodeSequence(o) {
    const fps = o.fps || 30, w = o.width, h = o.height;
    const pick = await pickCodec(w, h, fps);
    if (!pick) throw new Error("Aucun encodeur vidéo disponible sur cet ordinateur.");
    const mux = pick.kind === "mp4"
      ? new root.Mp4Muxer.Muxer({ target: new root.Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: w, height: h, frameRate: fps }, fastStart: "in-memory" })
      : new root.WebMMuxer.Muxer({ target: new root.WebMMuxer.ArrayBufferTarget(), video: { codec: pick.codec === "vp8" ? "V_VP8" : "V_VP9", width: w, height: h, frameRate: fps } });
    let encError = null;
    const encoder = new VideoEncoder({ output: (chunk, meta) => mux.addVideoChunk(chunk, meta), error: (e) => { encError = e; } });
    encoder.configure({ codec: pick.codec, width: w, height: h, bitrate: 6000000, framerate: fps });
    try {
    for (let i = 0; i < o.total; i++) {
      if (o.signal && o.signal.aborted) throw new Error("Export interrompu");
      if (encError) throw new Error("Erreur d'encodage : " + encError.message);
      const canvas = await o.renderFrame(i);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1000000) / fps), duration: Math.round(1000000 / fps) });
      encoder.encode(frame, { keyFrame: i % 60 === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 12) await new Promise((r) => setTimeout(r, 4));
      if (o.onProgress && i % 5 === 0) { o.onProgress(i / o.total); await new Promise((r) => setTimeout(r, 0)); }
    }
    await encoder.flush();
    } catch (e) { try { encoder.close(); } catch (_e) { /* déjà fermé */ } throw e; }
    encoder.close();
    if (encError) throw new Error("Erreur d'encodage : " + encError.message);
    mux.finalize();
    if (o.onProgress) o.onProgress(1);
    return { buffer: mux.target.buffer, ext: pick.kind, codec: pick.codec };
  }

  root.FutsalPlayer = { ScenePlayer, exportVideo, encodeSequence, pickCodec, WIDTH: W, HEIGHT: H };
})(window);
