/* Écran « Étiquetage » (menu Fichier) : le coach désigne le ballon et cadre les personnes sur les images d'une vidéo, à son rythme.
   Rien n'est proposé ni deviné. Chaque réponse est enregistrée tout de suite dans Documents\Futsal Analyzer\etiquettes\<vidéo>,
   avec l'image exacte vue : on peut fermer l'écran à tout moment et reprendre plus tard au même endroit. */
(function () {
  "use strict";
  const LS = window.FutsalLabelStore, api = window.fsal, $ = (id) => document.getElementById(id);
  if (!LS || !$("lab-screen")) return;
  const toast = (m, e) => { if (window.FSApp) window.FSApp.toast(m, e); };
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (_e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (_e) { /* mémoire du navigateur indisponible */ } };
  const STEPS = [[1, "toutes les images (3 par seconde)"], [3, "1 image par seconde"], [10, "1 image toutes les 3,3 s"], [30, "1 image toutes les 10 s"], [60, "1 image toutes les 20 s"], [90, "1 image toutes les 30 s"]];
  const TEAM_KEYS = ["A", "B", "GKA", "GKB", "ARB", "BANC", "PUBLIC", "AUTRE"];
  const TEAM_COLOR = { A: "#3b82f6", B: "#ef4444", GKA: "#06b6d4", GKB: "#f97316", ARB: "#eab308", BANC: "#a855f7", PUBLIC: "#9ca3af", AUTRE: "#ec4899" };

  const video = $("lab-video"), cv = $("lab-canvas"), ctx = cv.getContext("2d"), wrap = $("lab-zoom"), stage = $("lab-stage");
  let data = null, key = null, dir = "", ms = 0, mode = "ballon", team = "A", sel = null, view = { k: 1, tx: 0, ty: 0 };
  let saving = false, again = false, session = 0, drag = null, fit = { w: 0, h: 0 };
  const every = { ballon: Number(lsGet("lab.every.ballon")) || 1, joueurs: Number(lsGet("lab.every.joueurs")) || 60 };
  const imgDone = new Set();

  /* ---------- enregistrement ---------- */
  function setStatus(t, bad) { const s = $("lab-status"); s.textContent = t; s.style.color = bad ? "#fca5a5" : ""; }
  async function persist() {
    if (!data || !key) return;
    if (saving) { again = true; return; }
    saving = true; setStatus("Enregistrement…");
    try {
      const r = await api.labelsSave(key, data);
      if (r && r.error) setStatus("Enregistrement impossible : " + r.error, true); else { dir = (r && r.dir) || dir; setStatus("Tout est enregistré dans : " + dir); }
    } catch (_e) { setStatus("Enregistrement impossible pour le moment.", true); }
    saving = false;
    if (again) { again = false; persist(); }
  }
  /* L'image exacte vue par le coach est gardée avec l'étiquette (une seule fois par image). */
  async function saveImage() {
    const m = ms;      // l'instant de CETTE image, même si on passe à la suivante pendant l'écriture
    if (imgDone.has(m)) return;
    imgDone.add(m);
    try {
      const c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
      if (blob) await api.labelsSaveImage(key, m, await blob.arrayBuffer());
    } catch (_e) { imgDone.delete(m); }
  }
  function changed() { session++; saveImage(); persist(); refresh(); }

  /* ---------- vidéo et affichage ---------- */
  function layout() {
    const r = stage.getBoundingClientRect(), vw = video.videoWidth || 16, vh = video.videoHeight || 9, s = Math.min(r.width / vw, r.height / vh);
    fit = { w: Math.floor(vw * s), h: Math.floor(vh * s) };
    wrap.style.width = fit.w + "px"; wrap.style.height = fit.h + "px";
    applyView();
  }
  function applyView() { wrap.style.transform = "translate(" + view.tx + "px," + view.ty + "px) scale(" + view.k + ")"; draw(); }
  function resetView() { view = { k: 1, tx: Math.round((stage.clientWidth - fit.w) / 2), ty: Math.round((stage.clientHeight - fit.h) / 2) }; applyView(); }
  const toVideo = (e) => { const r = wrap.getBoundingClientRect(); return { u: ((e.clientX - r.left) / r.width) * video.videoWidth, v: ((e.clientY - r.top) / r.height) * video.videoHeight }; };
  function seekTo(t) {
    return new Promise((res) => {
      let fin = false; const done = () => { if (fin) return; fin = true; video.removeEventListener("seeked", done); res(); };
      video.addEventListener("seeked", done); video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.05)); setTimeout(done, 4000);
    });
  }
  async function goTo(t) {
    if (!data) return;
    ms = LS.snap(t); sel = null; video.pause();
    await seekTo(ms / 1000);
    data.pos = ms; persist();
    refresh(); draw();
  }

  function draw() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!data || !vw) return;
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    ctx.clearRect(0, 0, vw, vh);
    const px = (vw / (fit.w || vw)) / view.k;            // 1 pixel d'écran, en pixels vidéo : traits d'épaisseur constante à l'écran
    const f = data.frames[String(ms)];
    if (mode === "ballon") {
      if (f && f.ball && f.ball.state === "vu") {
        ctx.lineWidth = 2 * px; ctx.strokeStyle = "#f59e0b";
        ctx.beginPath(); ctx.arc(f.ball.u, f.ball.v, 14 * px, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(f.ball.u - 22 * px, f.ball.v); ctx.lineTo(f.ball.u - 6 * px, f.ball.v); ctx.moveTo(f.ball.u + 6 * px, f.ball.v); ctx.lineTo(f.ball.u + 22 * px, f.ball.v);
        ctx.moveTo(f.ball.u, f.ball.v - 22 * px); ctx.lineTo(f.ball.u, f.ball.v - 6 * px); ctx.moveTo(f.ball.u, f.ball.v + 6 * px); ctx.lineTo(f.ball.u, f.ball.v + 22 * px); ctx.stroke();
      }
    } else {
      LS.boxes(data, ms).forEach((b) => {
        ctx.lineWidth = (b.id === sel ? 4 : 2) * px; ctx.strokeStyle = TEAM_COLOR[b.team] || "#fff";
        ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
        const p = data.persons.find((x) => x.id === b.who), lab = (p ? (p.nom || p.id) : "") + (p ? " · " : "") + b.team;
        ctx.font = Math.round(13 * px) + "px sans-serif"; ctx.fillStyle = TEAM_COLOR[b.team] || "#fff";
        ctx.fillText(lab, b.x1, Math.max(12 * px, b.y1 - 4 * px));
      });
      if (drag && drag.box) { ctx.lineWidth = 2 * px; ctx.strokeStyle = TEAM_COLOR[team]; ctx.setLineDash([6 * px, 4 * px]); ctx.strokeRect(drag.box.x1, drag.box.y1, drag.box.x2 - drag.box.x1, drag.box.y2 - drag.box.y1); ctx.setLineDash([]); }
    }
  }

  /* ---------- panneau de droite ---------- */
  const fmt = (t) => { const s = Math.floor(t / 1000), m = Math.floor(s / 60); return m + " min " + String(s % 60).padStart(2, "0") + " s"; };
  function refresh() {
    if (!data) return;
    const c = LS.counts(data), f = data.frames[String(ms)] || {};
    $("lab-time").textContent = fmt(ms) + " — image " + (Math.round((ms * LS.GRID_FPS) / 1000) + 1) + " sur " + (LS.gridCount(data.video.duration) + 1);
    $("lab-counts").textContent = "Ballon : " + c.vu + " avec ballon, " + c.aucun + " sans ballon, " + c.incertain + " incertain(s). Joueurs : " + c.imagesJoueurs + " image(s) terminée(s), " + c.cadres + " cadre(s), " + c.changements + " changement(s). Cette séance : " + session + " réponse(s).";
    const b = f.ball;
    $("lab-this").textContent = mode === "ballon"
      ? (b ? (b.state === "vu" ? "Réponse : ballon désigné." : b.state === "aucun" ? "Réponse : aucun ballon visible." : "Réponse : incertain.") : "Pas encore de réponse sur cette image.")
      : (f.playersDone ? "Image terminée (" : "Pas terminée (") + LS.boxes(data, ms).length + " cadre(s)" + ").";
    document.querySelectorAll("#lab-screen [data-mode]").forEach((e) => e.classList.toggle("active", e.dataset.mode === mode));
    $("lab-ball-tools").hidden = mode !== "ballon"; $("lab-players-tools").hidden = mode !== "joueurs";
    document.querySelectorAll("#lab-teams [data-team]").forEach((e) => e.classList.toggle("active", e.dataset.team === team));
    const bx = sel ? LS.boxes(data, ms).find((x) => x.id === sel) : null;
    $("lab-sel").hidden = !bx;
    if (bx) { $("lab-sel-team").value = bx.team; fillWho($("lab-sel-who"), bx.who || ""); }
    $("lab-step").value = String(every[mode]);
    renderPersons(); renderSubs();
  }
  function renderSubs() {
    const box = $("lab-subs"), sel = $("lab-sub-who"), keep = sel.value;
    fillWho(sel, keep);
    sel.options[0].textContent = "— choisir la personne —";
    box.innerHTML = "";
    (data.subs || []).forEach((x) => {
      const p = data.persons.find((q) => q.id === x.who), row = document.createElement("div"); row.className = "lab-person";
      const t = document.createElement("span"); t.textContent = fmt(x.ms) + " — " + (p ? p.nom || p.id : x.who) + " " + (x.sens === "entre" ? "entre" : "sort"); row.appendChild(t);
      const b = document.createElement("button"); b.className = "ghost"; b.textContent = "Retirer"; b.addEventListener("click", () => { LS.removeSub(data, x.ms, x.who); changed(); }); row.appendChild(b);
      box.appendChild(row);
    });
  }
  function fillWho(s, v) {
    s.innerHTML = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "— personne non identifiée —"; s.appendChild(o0);
    data.persons.forEach((p) => { const o = document.createElement("option"); o.value = p.id; o.textContent = (p.nom || p.id) + " (" + LS.TEAMS[p.team] + ")"; s.appendChild(o); });
    s.value = v;
  }
  function renderPersons() {
    const box = $("lab-persons"); box.innerHTML = "";
    if (!data.persons.length) { box.textContent = "Aucune fiche. Ajoute les personnes du match (joueurs, remplaçants, arbitre) pour pouvoir dire qui est qui."; return; }
    data.persons.forEach((p) => {
      const row = document.createElement("div"); row.className = "lab-person";
      const t = document.createElement("span"); t.textContent = (p.nom || p.id) + " — " + LS.TEAMS[p.team] + (p.role ? " — " + p.role : ""); row.appendChild(t);
      const x = document.createElement("button"); x.className = "ghost"; x.textContent = "Retirer"; x.addEventListener("click", () => { LS.removePerson(data, p.id); changed(); }); row.appendChild(x);
      box.appendChild(row);
    });
  }

  /* ---------- actions ---------- */
  function setBall(state, u, v) {
    if (!data) return;
    if (!LS.setBall(data, ms, state, u, v)) { toast("Le clic est en dehors de l'image : réponse refusée.", true); return; }
    changed(); draw();
  }
  async function advance() {
    const n = LS.nextTodo(data, mode, ms, every[mode], 1);
    if (n == null) { toast("Il n'y a plus d'image à faire plus loin, avec ce pas. Bravo !"); return; }
    await goTo(n / 1000);
  }
  async function stepBy(d) {
    const k = Math.round((ms * LS.GRID_FPS) / 1000) + d * every[mode];
    if (k < 0 || k > LS.gridCount(data.video.duration)) { toast("Fin de la vidéo."); return; }
    await goTo(LS.gridMs(k) / 1000);
  }
  async function previousTodo() { const n = LS.nextTodo(data, mode, ms, every[mode], -1); if (n != null) await goTo(n / 1000); else toast("Rien d'à faire avant cette image."); }
  function answerBall(state) { setBall(state); if (state !== "vu") advance(); }
  function done() { LS.setPlayersDone(data, ms, true); changed(); advance(); }

  /* ---------- souris ---------- */
  stage.addEventListener("contextmenu", (e) => e.preventDefault());
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, k2 = Math.min(40, Math.max(1, view.k * (e.deltaY < 0 ? 1.25 : 0.8)));
    const qx = (px - view.tx) / view.k, qy = (py - view.ty) / view.k;
    view = { k: k2, tx: px - k2 * qx, ty: py - k2 * qy };
    if (k2 === 1) resetView(); else applyView();
  }, { passive: false });
  stage.addEventListener("pointerdown", (e) => {
    if (!data) return;
    stage.setPointerCapture(e.pointerId);
    if (e.button !== 0 || e.shiftKey) { drag = { pan: true, x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return; }
    const p = toVideo(e);
    drag = { x: e.clientX, y: e.clientY, p, moved: false, box: null };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.pan) { view.tx = drag.tx + e.clientX - drag.x; view.ty = drag.ty + e.clientY - drag.y; applyView(); return; }
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    if (mode === "joueurs" && drag.moved) { const p = toVideo(e); drag.box = { x1: Math.min(drag.p.u, p.u), y1: Math.min(drag.p.v, p.v), x2: Math.max(drag.p.u, p.u), y2: Math.max(drag.p.v, p.v) }; draw(); }
  });
  stage.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.pan) return;
    if (mode === "ballon") { if (!d.moved) { setBall("vu", d.p.u, d.p.v); advance(); } return; }
    if (d.moved && d.box) {
      const b = LS.addBox(data, ms, Object.assign({ team }, d.box));
      if (b) { sel = b.id; changed(); } else { toast("Cadre trop petit : il n'a pas été ajouté."); draw(); }
      return;
    }
    // simple clic en mode joueurs : choisir le plus petit cadre qui contient le point
    const hit = LS.boxes(data, ms).filter((b) => d.p.u >= b.x1 && d.p.u <= b.x2 && d.p.v >= b.y1 && d.p.v <= b.y2).sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1))[0];
    sel = hit ? hit.id : null; refresh(); draw();
  });

  /* ---------- clavier ---------- */
  function onKey(e) {
    if ($("lab-screen").hidden || !data) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const k = e.key;
    if (k === "ArrowRight") { stepBy(1); e.preventDefault(); }
    else if (k === "ArrowLeft") { stepBy(-1); e.preventDefault(); }
    else if (k === "+" || k === "=") { view.k = Math.min(40, view.k * 1.25); applyView(); }
    else if (k === "-") { view.k = Math.max(1, view.k * 0.8); if (view.k === 1) resetView(); else applyView(); }
    else if (k === "0") resetView();
    else if (mode === "ballon") {
      if (k === "Enter") { advance(); e.preventDefault(); }
      else if (k === "n" || k === "N") answerBall("aucun");
      else if (k === "?") answerBall("incertain");
      else if (k === "Delete" || k === "Backspace") { LS.clearBall(data, ms); changed(); draw(); }
    } else {
      if (k === "Enter") { done(); e.preventDefault(); }
      else if (/^[1-8]$/.test(k)) { team = TEAM_KEYS[Number(k) - 1]; if (sel && LS.setBoxTeam(data, ms, sel, team)) changed(); else refresh(); draw(); }
      else if ((k === "Delete" || k === "Backspace") && sel) { LS.removeBox(data, ms, sel); sel = null; changed(); draw(); }
    }
  }
  document.addEventListener("keydown", onKey);

  /* ---------- ouverture ---------- */
  async function loadVideo(v) {
    if (!v || v.error) { toast((v && v.error) || "Vidéo introuvable.", true); return; }
    video.src = v.url;
    await new Promise((res) => { const ok = () => { video.removeEventListener("loadedmetadata", ok); res(); }; video.addEventListener("loadedmetadata", ok); setTimeout(res, 15000); });
    if (!video.videoWidth) { toast("Cette vidéo ne peut pas être lue dans cet écran.", true); return; }
    key = await api.labelsKey(v.name, v.size);
    const r = await api.labelsLoad(key);
    const meta = { name: v.name, size: v.size, duration: video.duration, vw: video.videoWidth, vh: video.videoHeight };
    if (r && r.data && r.data.video.vw === meta.vw && r.data.video.vh === meta.vh) { data = r.data; data.video = meta; if (r.fromBackup) toast("Le fichier principal était abîmé : copie de secours rechargée."); }
    else data = LS.create(meta);
    dir = (r && r.dir) || ""; session = 0; imgDone.clear(); sel = null;
    lsSet("lab.last", v.path);
    $("lab-name").textContent = v.name; $("lab-empty").hidden = true; $("lab-main").hidden = false;
    layout(); resetView();
    const last = data.pos;
    const start = isFinite(last) && last > 0 ? last : LS.nextTodo(data, mode, -1, every[mode], 1);
    await goTo((start == null ? 0 : start) / 1000);
    setStatus(dir ? "Dossier des étiquettes : " + dir : "");
    persist();
  }
  async function pick() { const v = await api.pickVideo(); if (v && !v.canceled) await loadVideo(v); }
  function open() {
    const vid = document.querySelector("video"); if (vid && vid !== video) { try { vid.pause(); } catch (_e) { /* rien à arrêter */ } }
    $("lab-screen").hidden = false; layout();
    const last = lsGet("lab.last");
    $("lab-resume").hidden = !last; $("lab-resume").textContent = last ? "Reprendre : " + last.split(/[\\/]/).pop() : "";
  }
  async function close() { if (data) await persist(); $("lab-screen").hidden = true; video.pause(); }

  $("lab-pick").addEventListener("click", pick);
  $("lab-pick2").addEventListener("click", pick);
  $("lab-resume").addEventListener("click", async () => { const last = lsGet("lab.last"); if (last) await loadVideo(await api.resolveVideo(last)); });
  $("lab-close").addEventListener("click", close);
  $("lab-folder").addEventListener("click", () => { if (dir && api.showItem) api.showItem(dir + "\\etiquettes.json"); });
  document.querySelectorAll("#lab-screen [data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; sel = null; refresh(); draw(); }));
  $("lab-step").innerHTML = STEPS.map((s) => "<option value=\"" + s[0] + "\">" + s[1] + "</option>").join("");
  $("lab-step").addEventListener("change", () => { every[mode] = Number($("lab-step").value); lsSet("lab.every." + mode, String(every[mode])); });
  $("lab-next").addEventListener("click", advance);
  $("lab-prev").addEventListener("click", previousTodo);
  $("lab-none").addEventListener("click", () => answerBall("aucun"));
  $("lab-unsure").addEventListener("click", () => answerBall("incertain"));
  $("lab-clear").addEventListener("click", () => { LS.clearBall(data, ms); changed(); draw(); });
  $("lab-done").addEventListener("click", done);
  $("lab-zoom-reset").addEventListener("click", resetView);
  $("lab-go").addEventListener("click", () => {
    const m = /^\s*(\d+)\s*(?::|min|m)?\s*(\d{0,2})/.exec($("lab-goto").value || "");
    if (!m || !data) { toast("Écris le moment sous la forme 12:30 (minutes:secondes)."); return; }
    goTo(Number(m[1]) * 60 + Number(m[2] || 0));
  });
  $("lab-teams").innerHTML = TEAM_KEYS.map((k, i) => "<button data-team=\"" + k + "\" style=\"border-left:6px solid " + TEAM_COLOR[k] + "\">" + (i + 1) + " · " + LS.TEAMS[k] + "</button>").join("");
  $("lab-teams").addEventListener("click", (e) => { const b = e.target.closest("[data-team]"); if (!b) return; team = b.dataset.team; if (sel && LS.setBoxTeam(data, ms, sel, team)) changed(); else refresh(); draw(); });
  $("lab-sel-team").innerHTML = TEAM_KEYS.map((k) => "<option value=\"" + k + "\">" + LS.TEAMS[k] + "</option>").join("");
  $("lab-sel-team").addEventListener("change", () => { if (sel && LS.setBoxTeam(data, ms, sel, $("lab-sel-team").value)) changed(); draw(); });
  $("lab-sel-who").addEventListener("change", () => { if (sel && LS.setBoxWho(data, ms, sel, $("lab-sel-who").value)) changed(); draw(); });
  $("lab-sel-del").addEventListener("click", () => { if (sel) { LS.removeBox(data, ms, sel); sel = null; changed(); draw(); } });
  $("lab-pers-import").addEventListener("click", () => {
    if (!data) return;
    const r = LS.importPersons(data, $("lab-pers-multi").value);
    $("lab-pers-multi").value = r.refused.join("\n");      // ce qui n'a pas pu être lu reste dans la case, à corriger
    if (r.added.length) changed();
    toast(r.added.length + " fiche(s) ajoutée(s)" + (r.refused.length ? " ; " + r.refused.length + " ligne(s) non comprise(s), laissée(s) dans la case (écris « nom ; type »)." : "."), r.refused.length > 0 && !r.added.length);
  });
  const sub = (sens) => {
    if (!data) return;
    if (!LS.addSub(data, ms, $("lab-sub-who").value, sens)) { toast("Choisis d'abord la personne dans la liste."); return; }
    changed();
  };
  $("lab-sub-in").addEventListener("click", () => sub("entre"));
  $("lab-sub-out").addEventListener("click", () => sub("sort"));
  $("lab-pers-team").innerHTML = TEAM_KEYS.map((k) => "<option value=\"" + k + "\">" + LS.TEAMS[k] + "</option>").join("");
  $("lab-pers-add").addEventListener("click", () => {
    if (!data) return;
    const nom = $("lab-pers-nom").value.trim();
    if (!nom) { toast("Écris un nom ou un numéro pour la fiche."); return; }
    if (!LS.addPerson(data, { nom, team: $("lab-pers-team").value, role: $("lab-pers-role").value })) { toast("Fiche refusée (trop de fiches ?).", true); return; }
    $("lab-pers-nom").value = ""; changed();
  });
  window.addEventListener("resize", () => { if (!$("lab-screen").hidden && data) { layout(); resetView(); } });
  video.addEventListener("error", () => { if (!$("lab-screen").hidden) toast("Erreur de lecture de la vidéo dans l'écran d'étiquetage.", true); });

  window.FSLabel = { open, close, state: () => ({ data, key, ms, mode }), goTo, loadVideo };
})();
