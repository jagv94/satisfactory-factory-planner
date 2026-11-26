// Interfaz del planificador. Depende de Engine, Glyphs y Sankey.
{
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const NF = {};
const nf = (v, d = 2) => { if (!isFinite(v)) return "–"; const k = d; if (!NF[k]) { try { NF[k] = new Intl.NumberFormat("es-ES", {maximumFractionDigits: d, useGrouping: "always"}); } catch (e) { NF[k] = new Intl.NumberFormat("es-ES", {maximumFractionDigits: d}); } } return NF[k].format(Math.abs(v) < 5e-7 ? 0 : v); };
const KEY = "ficsit-planner-v2";
const EMBED = JSON.parse($("db").textContent);
let DB, COL, iconsFound = false;
const PHASES = [["Fase 1", [1]], ["Fase 2", [1, 2, 3]], ["Fase 3", [2, 4, 5]], ["Fase 4", [6, 7, 8, 9]], ["Fase 5", [9, 10, 11, 12]]].map(([n, a]) => [n + " del Space Elevator", a.map(i => `Desc_SpaceElevatorPart_${i}_C`)]);
const newPlan = (name, targets) => ({name, targets: targets || [], sel: {}, rc: {}, mode: "manual", objective: "weighted", maximize: false, allowManual: false, ban: {}, energy: "off", gridMW: 0});
const fresh = () => ({v: 2, lang: "es", icons: "auto", group: "level", tab: "prod", cur: 0, preset: "Fase 5 del Space Elevator",
  cfg: {clock: 1, belt: "Mk.6", pipe: "Mk.2", ext: {}, locked: {}, limits: {}},
  plans: [newPlan("Fase 5", PHASES[4][1].map(item => ({item, rate: 1})))]});
let S = fresh(), hist = [];
function loadDB(db) { DB = db; Engine.init(DB); COL = Glyphs.colors(DB, Engine); }
loadDB(EMBED);
// estado guardado o importado: los campos de plan que empiezan por «_» son internos del motor o de las pruebas
// (p. ej. _pressMax) y se descartan, así que no se pueden fijar desde una configuración
const restore = s => Object.assign(fresh(), s, {cfg: Object.assign(fresh().cfg, s.cfg),
  plans: s.plans.map(p => Object.fromEntries(Object.entries(p || {}).filter(([k]) => !k.startsWith("_"))))});
try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.v === 2 && Array.isArray(s.plans) && s.plans.length) S = restore(s); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const P = () => S.plans[Math.min(S.cur, S.plans.length - 1)];
let pend = 0;
function set(mut) { hist.push(JSON.stringify(S)); if (hist.length > 80) hist.shift(); mut(); save(); clearTimeout(pend); pend = setTimeout(render, 0); }

// ---------- nombres, iconos y unidades
const POWER = Engine.POWER;
const nm = id => (DB.items[id] || {})[S.lang] || id;
const fluid = id => DB.items[id] && (DB.items[id].form === "liquid" || DB.items[id].form === "gas");
const unit = id => id === POWER ? "MW" : fluid(id) ? "m³/min" : "/min";
const isGenP = p => !!(p && p.kind === "recipe" && p.b && p.b.generator);
const fuelOf = r => Object.keys(r.in).find(k => k !== "Desc_Water_C") || Object.keys(r.in)[0];
// nombre de receta: los generadores se nombran por su combustible
const recName = r => Engine.isGen(r) ? nm(fuelOf(r)) : r[S.lang];
const WASTE = ["Desc_NuclearWaste_C", "Desc_PlutoniumWaste_C"];
const bnm = p => !p.building ? (p.kind === "manual" ? "A mano" : "Externo") : p.kind === "extract" ? p.bname[S.lang] || p.bname.en : DB.buildings[p.building][S.lang];
function optLabel(o) {
  if (o === "import") return "Externo / importado";
  if (o === "manual") return "Recolección manual";
  if (o.startsWith("x:")) { const e = DB.extractors[o.slice(2)]; return e[S.lang] || e.en; }
  const r = Engine.R[o]; return (r.alt ? "Alt: " : "") + recName(r) + " · " + DB.buildings[r.building][S.lang];
}
const useIcons = () => iconsFound && S.icons !== "glyph";
const glyph = id => `<svg class="ic" style="color:${COL[id] || "#888"}" aria-hidden="true"><use href="#g-${Glyphs.shape(DB.items[id] || {en: ""})}"/></svg>`;
const ic = id => useIcons() ? `<img class="ic" src="icons/${esc(id)}.png" alt="" data-id="${esc(id)}">` : glyph(id);
document.addEventListener("error", e => { const t = e.target; if (t.tagName === "IMG" && t.classList.contains("ic") && t.dataset.id) t.outerHTML = glyph(t.dataset.id); }, true);
const searchKey = id => ((DB.items[id] || {}).es + " " + (DB.items[id] || {}).en).toLowerCase();
const idByName = n => { n = n.trim().toLowerCase(); for (const [k, v] of Object.entries(DB.items)) if (v.es.toLowerCase() === n || v.en.toLowerCase() === n) return k; return null; };

// ---------- cálculo
const costCache = new Map();
function cost(item) {
  const key = JSON.stringify([S.cfg, {...P(), targets: null, name: null}, item]);
  if (!costCache.has(key)) { if (costCache.size > 400) costCache.clear(); costCache.set(key, Engine.costPerUnit(S.cfg, P(), item)); }
  return costCache.get(key);
}
function compute() {
  const res = Engine.solve(S.cfg, P());
  const A = Engine.analyze(S.cfg, res);
  A.depth = Engine.depths(res); A.res = res;
  return A;
}
const ERR = {cycle: "Las recetas elegidas forman un ciclo sin salida (p. ej. empaquetar y desempaquetar el mismo fluido). Cambia alguna.",
  infeasible: "No hay solución con las recetas desbloqueadas y los límites actuales. Revisa los límites, desbloquea alternativas o permite recursos recolectados a mano. Si generas la energía en la fábrica, comprueba que no hayas excluido todos los generadores.",
  unbounded: "Sin techo: para maximizar pon límites a las materias primas (ojo: el Converter convierte unas en otras, así que conviene limitar todas).",
  iterations: "El optimizador no ha convergido. Simplifica los objetivos o cambia el criterio.",
  press: "El reparto de la potencia de los Pressurizers entre los extractores de pozo no ha cuadrado tras varias vueltas, así que no se muestra ningún resultado. Prueba a cambiar el número de pozos o el reloj del fluido de pozo en Extracción, a cambiar el criterio o a excluir alguna receta."};

// ---------- render
function render() {
  const fa = document.activeElement, fk = fa && fa.dataset ? fa.dataset.fk : null, selS = fa && "selectionStart" in fa ? [fa.selectionStart, fa.selectionEnd] : null;
  const scrollY = window.scrollY;
  const plan = P(), A = compute();
  renderHead(plan, A); renderTargets(plan); renderCalc(plan); renderSettings(); renderRaw(A); renderTabs(plan, A);
  if (fk) { const el = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el) { el.focus({preventScroll: true}); try { if (selS && el.setSelectionRange) el.setSelectionRange(...selS); } catch (e) {} } }
  window.scrollTo(0, scrollY);
}
function renderHead(plan, A) {
  $("plan").innerHTML = S.plans.map((p, i) => `<option value="${i}"${i === S.cur ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  $("pname").value = plan.name;
  $("undo").disabled = !hist.length;
  const R = A.rows, rec = R.filter(r => r.p.kind === "recipe" && !r.p.b.generator), ex = R.filter(r => r.p.kind === "extract");
  const sum = (a, f) => a.reduce((s, r) => s + f(r), 0);
  const E = A.energy, pw = E.cons, gen = E.gen;
  const solid = sum(A.raw.filter(r => !fluid(r.item) && !r.kinds.has("import")), r => r.rate), fl = sum(A.raw.filter(r => fluid(r.item) && !r.kinds.has("import")), r => r.rate);
  let top = null; for (const r of A.raw) { const w = DB.world[r.item]; if (w && (!top || r.rate / w > top.s)) top = {item: r.item, s: r.rate / w}; }
  const k = [["Máquinas", nf(sum(rec, r => r.build), 0)], ["Extractores", nf(sum(ex, r => r.build), 0)], ["Consumo", nf(pw, 0) + " MW"]];
  if (gen || E.on) k.push(["Generación", nf(gen, 0) + " MW", E.grid ? `+ ${nf(E.grid, 0)} MW externos` : ""]);
  if (E.on) k.push(["Balance de energía", (E.balance >= 0 ? "+" : "") + nf(E.balance, 0) + " MW"]);
  k.push(["Uso del mapa (suma)", nf(A.score * 100, 2) + " %", top ? `máx. ${nm(top.item)} ${nf(top.s * 100, 1)} %` : ""]);
  k.push(["Sólidos en bruto", nf(solid, 0) + "/min"], ["Fluidos en bruto", nf(fl, 0) + " m³/min"]);
  const sh = sum(R, r => r.shards), sl = sum(R, r => r.sloops);
  if (sh || sl) k.push(["Fragmentos · Somersloops", nf(sh, 0) + " · " + nf(sl, 0)]);
  if (A.scale) k.unshift(["Escala máxima", "×" + nf(A.scale, 3)]);
  $("kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi"><b>${esc(b)}</b><span>${esc(a)}${c ? `<em>${esc(c)}</em>` : ""}</span></div>`).join("");
  const w = [];
  if (A.error) w.push(ERR[A.error] || A.error);
  // con error no hay pasos: todos los objetivos saldrían como déficit y el consejo de elegir receta confundiría
  if (!A.error) for (const [i, b] of Object.entries(A.balance)) if (b.net < -1e-6) w.push(`Déficit de ${nm(i)}: faltan ${nf(-b.net)} ${unit(i)}. Elige una receta que lo produzca o márcalo como externo.`);
  for (const m of energyWarnings(A)) w.push(m);
  const bc = DB.belts[S.cfg.belt], pc = DB.pipes[S.cfg.pipe];
  for (const r of ex) { const f = fluid(r.p.item), cap = f ? pc : bc, per = r.p.out[r.p.item]; if (per > cap + 1e-9) w.push(`Un extractor de ${nm(r.p.item)} da ${nf(per)} ${unit(r.p.item)}: supera la ${f ? "tubería" : "cinta"} ${f ? S.cfg.pipe : S.cfg.belt}.`); }
  for (const r of A.raw) { const L = S.cfg.limits[r.item]; if (L !== undefined && L !== null && L !== "" && r.rate > +L + 1e-6) w.push(`${nm(r.item)}: ${nf(r.rate)} supera tu límite de ${nf(+L)}.`); }
  $("warns").innerHTML = w.map(x => `<div>${esc(x)}</div>`).join("");
}
function renderTargets(plan) {
  const presets = [...PHASES.map(p => p[0]), "Todas las piezas finales", "Vacío"];
  $("preset").innerHTML = presets.map(p => `<option${p === S.preset ? " selected" : ""}>${esc(p)}</option>`).join("");
  $("targets").innerHTML = plan.targets.length ? plan.targets.map((t, k) => {
    const c = cost(t.item);
    return `<div class="tg">${ic(t.item)}<div><b>${esc(nm(t.item))}</b><small>${c.error ? "sin solución con estas recetas" : "coste ≈ " + nf(c.score * 100, c.score < .01 ? 3 : 1) + " % del mapa por cada 1/min"}</small></div>
      <input type="number" min="0" step="0.1" value="${t.rate}" data-fk="t:${k}" data-act="trate" data-k="${k}" aria-label="Cantidad de ${esc(nm(t.item))}">
      <button class="x" data-act="tdel" data-k="${k}" aria-label="Quitar ${esc(nm(t.item))}">×</button></div>`;
  }).join("") : `<p class="hint">Sin objetivos. Elige un preset o añade piezas.</p>`;
  $("itemlist").innerHTML = Object.keys(DB.items).map(k => `<option value="${esc(nm(k))}">`).join("");
}
function renderCalc(plan) {
  const opt = plan.mode === "opt";
  $("mManual").setAttribute("aria-pressed", !opt); $("mOpt").setAttribute("aria-pressed", opt);
  $("optBox").hidden = !opt;
  $("objective").value = plan.objective; $("maximize").checked = !!plan.maximize; $("allowManual").checked = !!plan.allowManual;
  const eon = plan.energy === "gen";
  $("energy").value = eon ? "gen" : "off"; $("gridMW").value = plan.gridMW || ""; $("gridBox").hidden = !eon;
  $("energyHint").textContent = eon ? (opt ? "Las máquinas consumen la energía que producen los generadores de la fábrica; el optimizador elige generadores y combustibles según el criterio." : "Elige el generador y su combustible en la fila «Energía» de la tabla de producción.") : "La energía solo se informa: no se planifican generadores.";
  const nb = Object.keys(plan.ban || {}).length;
  $("banInfo").innerHTML = nb ? `${nb} receta(s) excluida(s) del optimizador. <button class="x" data-act="unban">Volver a permitirlas</button>` : "";
  $("modeHint").textContent = opt ? "El motor elige y mezcla recetas (estándar y alternativas desbloqueadas) según el criterio. Puedes excluir recetas desde la tabla." : "Tú eliges una receta por objeto en la tabla de producción. Los subproductos se descuentan solos.";
}
function renderSettings() {
  $("clock").value = Math.round(S.cfg.clock * 100);
  $("belt").innerHTML = Object.entries(DB.belts).map(([k, v]) => `<option value="${k}"${k === S.cfg.belt ? " selected" : ""}>${k} · ${nf(v, 0)}/min</option>`).join("");
  $("pipe").innerHTML = Object.entries(DB.pipes).map(([k, v]) => `<option value="${k}"${k === S.cfg.pipe ? " selected" : ""}>${k} · ${nf(v, 0)} m³/min</option>`).join("");
  $("lang").value = S.lang; $("icons").value = S.icons; $("group").value = S.group;
  $("iconInfo").textContent = iconsFound ? "Carpeta icons/ encontrada: se usan los iconos del juego." : location.protocol === "file:" ? "No hay carpeta icons/ junto a la herramienta: se usan glifos propios (ver README)." : "En la versión web se usan glifos propios; los iconos del juego solo funcionan abriendo el archivo descargado (ver README).";
}
function renderExt(plan) {
  const raws = Object.keys(Engine.OPTS).sort((a, b) => nm(a).localeCompare(nm(b)));
  const pur = Object.keys(DB.purity);
  $("exttab").innerHTML = `<thead><tr><th>Recurso</th><th>Fuente</th><th>Tier</th><th>Pureza</th><th class="n">Reloj %</th><th class="n" title="Resource Well Pressurizers: uno por pozo">Pozos (Pressurizers)</th><th class="n">Límite /min</th></tr></thead><tbody>` + raws.map(i => {
    const s = Engine.selOf(S.cfg, plan, i), c = Engine.extCfg(S.cfg, i), e = s.startsWith("x:") ? DB.extractors[s.slice(2)] : null;
    const opts = Engine.options(S.cfg, i).map(o => `<option value="${esc(o)}"${o === s ? " selected" : ""}>${esc(o.startsWith("x:") ? optLabel(o) : o === "import" ? "Externo" : "Converter: " + Engine.R[o][S.lang])}</option>`).join("");
    const L = S.cfg.limits[i];
    return `<tr><td class="nw">${ic(i)} ${esc(nm(i))}</td><td><select data-fk="xs:${i}" data-act="sel" data-item="${i}" aria-label="Fuente de ${esc(nm(i))}">${opts}</select></td>
      <td>${s === "x:miner" ? `<select data-fk="xt:${i}" data-act="ext" data-item="${i}" data-f="tier">${Object.keys(DB.extractors.miner.tiers).map(t => `<option${t === c.tier ? " selected" : ""}>${t}</option>`).join("")}</select>` : "–"}</td>
      <td>${e && e.purity !== false ? `<select data-fk="xp:${i}" data-act="ext" data-item="${i}" data-f="purity">${pur.map(p => `<option${p === c.purity ? " selected" : ""}>${p}</option>`).join("")}</select>` : "–"}</td>
      <td class="n">${e ? `<input type="number" min="1" max="250" step="1" value="${Math.round(c.clock * 100)}" data-fk="xc:${i}" data-act="ext" data-item="${i}" data-f="clock" class="w5">` : "–"}</td>
      <td class="n">${s === "x:well" ? `<input type="number" min="0" step="1" value="${c.wells ?? ""}" placeholder="sin indicar" data-fk="xw:${i}" data-act="ext" data-item="${i}" data-f="wells" class="w7" aria-label="Pozos (Pressurizers) de ${esc(nm(i))}">` : "–"}</td>
      <td class="n"><input type="number" min="0" step="1" value="${L ?? ""}" placeholder="${DB.world[i] ? nf(DB.world[i], 0) : "sin límite"}" data-fk="xl:${i}" data-act="limit" data-item="${i}" class="w7" aria-label="Límite de ${esc(nm(i))}"></td></tr>`;
  }).join("") + "</tbody>";
}
function renderRaw(A) {
  const rows = A.raw.filter(r => r.rate > 1e-9).map(r => ({...r, share: DB.world[r.item] ? r.rate / DB.world[r.item] : null}))
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.rate - a.rate);
  const maxS = Math.max(1e-9, ...rows.map(r => r.share || 0)), maxR = Math.max(1, ...rows.map(r => r.rate));
  $("rawTitle").textContent = rows.length ? `Materias primas · ${rows.length}` : "Materias primas";
  $("raw").innerHTML = rows.length ? rows.map(r => {
    const how = r.kinds.has("extract") ? `${nf(r.build, 0)} extractor${r.build === 1 ? "" : "es"}` : r.kinds.has("manual") ? "a mano" : "externo";
    const w = r.share !== null ? r.share / maxS : r.rate / maxR * .5;
    return `<div class="bar"><span class="nw">${ic(r.item)} ${esc(nm(r.item))}</span><i style="width:${(w * 100).toFixed(2)}%;background:${COL[r.item]}"></i>
      <em><b>${nf(r.rate, 1)}</b> ${unit(r.item)}${r.share !== null ? ` · ${nf(r.share * 100, 1)} % del mapa` : ""} · ${how}</em></div>`;
  }).join("") : `<p class="hint">Nada que extraer todavía.</p>`;
}
function renderTabs(plan, A) {
  for (const b of document.querySelectorAll("#tabs button")) { const on = b.dataset.t === S.tab; b.setAttribute("aria-selected", on); $("v-" + b.dataset.t).hidden = !on; }
  const f = {prod: renderProd, sankey: renderSankey, tree: renderTree, ext: renderExt, mach: renderMach, energy: renderEnergy, surp: renderSurp, alts: renderAlts}[S.tab];
  f(plan, A);
}
function renderProd(plan, A) {
  const opt = plan.mode === "opt", bc = DB.belts[S.cfg.belt], pc = DB.pipes[S.cfg.pipe];
  const isRaw = r => r.p.kind === "extract" || r.p.kind === "manual" || r.p.kind === "import";
  const lvl = r => isRaw(r) ? -1 : A.depth[r.p.item] ?? 0;
  const rows = [...A.rows].filter(r => r.x > 1e-9).sort((a, b) => S.group === "building" ? bnm(a.p).localeCompare(bnm(b.p)) || lvl(b) - lvl(a) : lvl(b) - lvl(a) || nm(a.p.item).localeCompare(nm(b.p.item)));
  // objetos solo-subproducto (manual)
  for (const i of A.res.byproductOnly || []) if (A.balance[i] && A.balance[i].prod > 1e-9) rows.push({p: {item: i, kind: "by", in: {}, out: {}}, x: 0, rate: 0, build: null, power: 0, shards: 0, by: true});
  let g = null, h = "";
  const maxL = Math.max(0, ...rows.map(lvl));
  for (const r of rows) {
    const gk = S.group === "building" ? bnm(r.p) : isRaw(r) ? "Materias primas" : "Nivel " + (maxL - lvl(r) + 1);
    if (r.by) { if (g !== "Solo subproducto") { g = "Solo subproducto"; h += `<tr class="grp"><td colspan="10">Solo como subproducto</td></tr>`; } }
    else if (gk !== g) { g = gk; h += `<tr class="grp"><td colspan="10">${esc(g)}</td></tr>`; }
    const it = r.p.item, b = A.balance[it] || {prod: 0}, fl = fluid(it), tgt = A.d[it];
    const extra = b.prod - r.rate;
    let recipe;
    if (r.by) recipe = `<span class="m">producido por otras recetas</span>`;
    else if (!opt) recipe = `<select data-fk="s:${it}" data-act="sel" data-item="${it}" class="${r.p.recipe && r.p.recipe.alt ? "alt" : ""}" aria-label="Receta de ${esc(nm(it))}">${(cur => Engine.options(S.cfg, it, cur).map(o => `<option value="${esc(o)}"${o === cur ? " selected" : ""}>${esc(optLabel(o))}</option>`).join(""))(Engine.selOf(S.cfg, plan, it))}</select>`;
    else recipe = `<span class="${r.p.recipe && r.p.recipe.alt ? "alt" : ""}">${esc(r.p.recipe ? (r.p.recipe.alt ? "Alt: " : "") + recName(r.p.recipe) : optLabel(r.p.kind === "extract" ? "x:" + r.p.ext : r.p.kind))}</span><small>${esc(bnm(r.p))}</small>${r.p.recipe ? ` <button class="x" data-act="ban" data-id="${r.p.id}" title="Excluir esta receta del optimizador">excluir</button>` : ""}`;
    const isM = r.p.kind === "recipe" || r.p.kind === "extract";
    const slots = r.p.kind === "recipe" ? r.p.b.slots : 0;
    const clockIn = isM ? `<input type="number" min="1" max="250" step="1" class="w5" value="${Math.round(r.p.clock * 100)}" data-fk="c:${r.p.id}" data-act="${r.p.kind === "extract" ? "ext" : "rclock"}" data-id="${r.p.id}" data-item="${it}" data-f="clock" aria-label="Reloj">` + (r.uclock && Math.abs(r.uclock - r.p.clock) > 5e-4 ? `<small>real ${nf(r.uclock * 100, 1)} %</small>` : "") : "–";
    const sl = slots ? `<input type="number" min="0" max="${slots}" step="1" class="w4" value="${r.p.sloops || 0}" data-fk="l:${r.p.id}" data-act="rsloop" data-id="${r.p.id}" aria-label="Somersloops (máx. ${slots})">` : "–";
    h += `<tr data-name="${esc(searchKey(it))}" class="${r.p.kind === "extract" || r.p.kind === "manual" ? "raw" : r.p.kind === "import" ? "imp" : fl ? "fl" : ""}">
      <td class="obj">${ic(it)}<div><b>${esc(nm(it))}</b>${tgt ? `<small class="tgt">objetivo ${nf(tgt)}</small>` : ""}${b.net > 1e-6 && !r.by ? `<small class="sur">sobra ${nf(b.net)}</small>` : ""}</div></td>
      <td class="rec">${recipe}</td>
      <td class="n">${r.by ? nf(b.prod) : nf(r.rate)}<span class="u">${unit(it)}</span>${extra > 1e-6 && !r.by ? `<small>+${nf(extra)} subprod.</small>` : ""}</td>
      <td class="n">${isM ? nf(r.x) : "–"}</td><td class="n"><b>${isM ? nf(r.build, 0) : "–"}</b></td>
      <td class="n">${clockIn}</td><td class="n">${sl}</td><td class="n">${r.power < 0 ? `<span class="ok" title="Genera">+${nf(-r.power, 1)}</span>` : r.power ? nf(r.power, 1) : "–"}</td><td class="n">${r.shards || "–"}</td>
      <td class="n ${fl ? "flt" : ""}">${it === POWER ? "–" : nf(b.prod / (fl ? pc : bc))}</td></tr>`;
  }
  $("prod").innerHTML = `<thead><tr><th>Objeto</th><th>Receta</th><th class="n">Producción</th><th class="n">Máquinas</th><th class="n">Construir</th><th class="n">Reloj %</th><th class="n">Somersloops</th><th class="n">MW</th><th class="n">Fragm.</th><th class="n">Líneas</th></tr></thead><tbody>${h}</tbody>`;
  filterProd();
}
function filterProd() {
  const q = ($("q").value || "").trim().toLowerCase();
  for (const tr of $("prod").querySelectorAll("tbody tr[data-name]")) tr.hidden = q && !tr.dataset.name.includes(q);
}
let skRO = null;
function renderSankey(plan, A) {
  const svg = $("sk");
  const go = () => Sankey.draw(svg, A, {color: i => COL[i] || "#888", name: nm, esc, fmt: v => nf(v, 1), unit});
  requestAnimationFrame(go);
  if (skRO) skRO.disconnect();
  skRO = new ResizeObserver(() => go()); skRO.observe($("v-sankey"));
}
function renderTree(plan, A) {
  const main = {}; for (const r of A.rows) if (!main[r.p.item] || r.x > main[r.p.item].x) main[r.p.item] = r;
  let budget = 3000;
  const node = (item, rate, stack, depth) => {
    budget--;
    const r = main[item], p = r ? r.p : null, q = p ? p.out[item] : 1;
    const m = p && (p.kind === "recipe" || p.kind === "extract") ? rate / q : null;
    const head = `${ic(item)} <span class="q">${nf(rate)} ${unit(item)}</span> <b>${esc(nm(item))}</b> <span class="m">· ${esc(p ? (p.recipe ? recName(p.recipe) + (isGenP(p) ? " · " + bnm(p) : "") : bnm(p)) : "subproducto")}${m !== null ? " · " + nf(m) + " máq." : ""}</span>`;
    if (!p || p.kind !== "recipe" || !Object.keys(p.in).length) return `<li class="leaf">${head}</li>`;
    if (stack.includes(item) || depth > 25 || budget < 0) return `<li class="leaf">${head} <span class="m">↻</span></li>`;
    const by = Object.entries(p.out).filter(([k]) => k !== item && k !== POWER).map(([k, v]) => `${nf(rate / q * v)} ${unit(k)} ${esc(nm(k))}`).join(", ");
    return `<li><details${depth < 2 ? " open" : ""}><summary>${head}${by ? ` <span class="m">· subproducto: ${by}</span>` : ""}</summary><ul>${Object.entries(p.in).filter(([j]) => j !== POWER).map(([j, v]) => node(j, rate / q * v, [...stack, item], depth + 1)).join("")}</ul></details></li>`;
  };
  const t = Object.entries(A.d).filter(([, v]) => v > 0);
  $("tree").innerHTML = t.length ? `<ul>${t.map(([i, v]) => node(i, v, [], 0)).join("")}</ul>` : `<p class="hint">Sin objetivos.</p>`;
}
function renderMach(plan, A) {
  const by = machinesBy(A);
  const e = Object.entries(by).sort((a, b) => b[1].n - a[1].n), tot = k => e.reduce((a, [, v]) => a + v[k], 0);
  const mw = v => v.p < 0 ? `<span class="ok" title="Genera">+${nf(-v.p, 1)}</span>` : nf(v.p, 1);
  $("mach").innerHTML = `<thead><tr><th>Máquina</th><th class="n">Unidades</th><th class="n">MW</th><th class="n">Fragmentos</th><th class="n">Somersloops</th></tr></thead><tbody>` +
    e.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${nf(v.n, 0)}</td><td class="n">${mw(v)}</td><td class="n">${nf(v.s, 0)}</td><td class="n">${nf(v.l, 0)}</td></tr>`).join("") +
    `<tr class="tot"><td>Total</td><td class="n">${nf(tot("n"), 0)}</td><td class="n">${nf(A.energy.cons, 1)}</td><td class="n">${nf(tot("s"), 0)}</td><td class="n">${nf(tot("l"), 0)}</td></tr></tbody>`;
  $("machNote").textContent = (A.energy.gen ? "El total de MW es el consumo; los generadores aparecen con su producción (+). " : "") + (A.energy.missingWells.length ? missingWellsText(A) : "");
}
// ---------- energía
function machinesBy(A) {
  const by = {};
  for (const r of A.rows) if (r.build && r.p.building) { const k = bnm(r.p); by[k] = by[k] || {n: 0, p: 0, s: 0, l: 0, gen: isGenP(r.p)}; by[k].n += r.build; by[k].p += r.power; by[k].s += r.shards; by[k].l += r.sloops; }
  const pn = DB.extractors.well.pressurizerName || {en: "Resource Well Pressurizer"};
  for (const pz of A.energy.press) if (pz.wells) { const k = pn[S.lang] || pn.en; by[k] = by[k] || {n: 0, p: 0, s: 0, l: 0}; by[k].n += pz.wells; by[k].p += pz.power; by[k].s += pz.wells * Engine.shards(pz.clock); }
  return by;
}
const missingWellsText = A => `Pozos sin indicar (${A.energy.missingWells.map(nm).join(", ")}): sus Pressurizers (${nf(DB.extractors.well.pressurizer, 0)} MW cada uno) no se suman ni cuentan en el optimizador. Indica cuántos pozos usas en Extracción → «Pozos (Pressurizers)».`;
// avisos de energía en la cabecera; los pozos sin indicar solo se avisan ahí si la fábrica genera su energía
// (con «solo informar» se indican en las pestañas Máquinas y Energía)
function energyWarnings(A) {
  const w = [];
  if (A.energy.on && A.energy.missingWells.length) w.push(missingWellsText(A));
  const waste = WASTE.filter(i => A.balance[i] && A.balance[i].net > 1e-6);
  if (waste.length) w.push(`La central nuclear deja ${waste.map(i => `${nf(A.balance[i].net)} /min de ${nm(i)}`).join(" y ")} sin destino. Los residuos nucleares no se pueden destruir en el AWESOME Sink: solo almacenarse o reprocesarse (a plutonio o ficsonio). Para evitarlos, excluye las recetas nucleares en el optimizador.`);
  return w;
}
function renderEnergy(plan, A) {
  const E = A.energy, gens = A.rows.filter(r => isGenP(r.p) && r.build);
  const box = (lbl, v, cls = "") => `<div class="${cls}"><b>${v}</b><span>${esc(lbl)}</span></div>`;
  $("esum").innerHTML = box("Consumo", nf(E.cons, 1) + " MW") + box("Generación", nf(E.gen, 1) + " MW") + (E.grid ? box("Energía externa", nf(E.grid, 1) + " MW") : "") +
    (E.on || E.gen ? box("Balance", (E.balance >= 0 ? "+" : "") + nf(E.balance, 1) + " MW", E.balance < -1e-6 ? "neg" : "pos") : "");
  const wasteOf = r => Object.entries(r.p.recipe.out).filter(([k]) => k !== POWER).map(([k, v]) => `${nf(r.x * v)} ${esc(nm(k))}`).join(", ");
  const water = r => r.p.in.Desc_Water_C ? nf(r.x * r.p.in.Desc_Water_C, 1) : "–";
  $("egen").innerHTML = gens.length ? `<thead><tr><th>Generador · combustible</th><th class="n">Unidades</th><th class="n">Reloj real %</th><th class="n">MW</th><th class="n">Combustible /min</th><th class="n">Agua m³/min</th><th>Residuos /min</th></tr></thead><tbody>` +
    gens.map(r => { const f = fuelOf(r.p.recipe); return `<tr><td class="obj">${ic(f)}<div><b>${esc(nm(f))}</b><small>${esc(bnm(r.p))}</small></div></td><td class="n">${nf(r.build, 0)}</td><td class="n">${nf(r.uclock * 100, 1)}</td><td class="n">${nf(-r.power, 1)}</td><td class="n">${nf(r.x * r.p.in[f])} <span class="u">${unit(f)}</span></td><td class="n">${water(r)}</td><td class="nw">${wasteOf(r) || "–"}</td></tr>`; }).join("") +
    `<tr class="tot"><td>Total</td><td class="n">${nf(gens.reduce((a, r) => a + r.build, 0), 0)}</td><td></td><td class="n">${nf(E.gen, 1)}</td><td></td><td class="n">${(w => w ? nf(w, 1) : "–")(gens.reduce((a, r) => a + (r.p.in.Desc_Water_C ? r.x * r.p.in.Desc_Water_C : 0), 0))}</td><td></td></tr></tbody>`
    : `<tbody><tr><td class="m">${E.on ? "Sin generadores: la energía externa cubre todo el consumo." : "Generación no planificada. Para que la fábrica genere su energía, elige «Generarla en la fábrica» en Cálculo."}</td></tr></tbody>`;
  $("enote").textContent = E.missingWells.length ? missingWellsText(A) : "";
  const by = machinesBy(A), cons = Object.entries(by).filter(([, v]) => v.p > 0).sort((a, b) => b[1].p - a[1].p);
  $("econs").innerHTML = `<thead><tr><th>Máquina</th><th class="n">Unidades</th><th class="n">MW</th><th class="n">% del consumo</th></tr></thead><tbody>` +
    cons.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${nf(v.n, 0)}</td><td class="n">${nf(v.p, 1)}</td><td class="n">${nf(E.cons ? v.p / E.cons * 100 : 0, 1)}</td></tr>`).join("") +
    `<tr class="tot"><td>Total</td><td class="n">${nf(cons.reduce((a, [, v]) => a + v.n, 0), 0)}</td><td class="n">${nf(E.cons, 1)}</td><td class="n">100</td></tr></tbody>`;
}
function renderSurp(plan, A) {
  const sp = Object.entries(A.balance).filter(([i, b]) => i !== POWER && b.net > 1e-6).sort((a, b) => b[1].net - a[1].net);
  $("surp").innerHTML = sp.length ? `<thead><tr><th>Objeto</th><th class="n">Producido</th><th class="n">Consumido + objetivo</th><th class="n">Sobra</th></tr></thead><tbody>` +
    sp.map(([i, b]) => `<tr><td class="nw">${ic(i)} ${esc(nm(i))}</td><td class="n">${nf(b.prod)}</td><td class="n">${nf(b.cons + b.target)}</td><td class="n"><b>${nf(b.net)}</b> <span class="u">${unit(i)}</span></td></tr>`).join("") + "</tbody>"
    : `<tbody><tr><td class="ok">Sin excedentes: todo lo producido se consume.</td></tr></tbody>`;
}
function renderAlts() {
  const alts = DB.recipes.filter(r => r.alt), q = ($("aq").value || "").trim().toLowerCase(), fil = $("af").value;
  const L = S.cfg.locked;
  const byP = {};
  for (const r of alts) { const p = Object.keys(r.out)[0]; (byP[p] = byP[p] || []).push(r); }
  const n = alts.filter(r => !L[r.id]).length;
  $("altCount").textContent = `${n} de ${alts.length} alternativas desbloqueadas`;
  const fmtIO = o => Object.entries(o).map(([k, v]) => `${ic(k)}${nf(v)} ${esc(nm(k))}`).join(" + ");
  $("alts").innerHTML = Object.keys(byP).sort((a, b) => nm(a).localeCompare(nm(b))).map(p => {
    const rs = byP[p].filter(r => (fil === "all" || (fil === "on") === !L[r.id]) && (!q || (r.es + " " + r.en + " " + searchKey(p)).toLowerCase().includes(q)));
    if (!rs.length) return "";
    return `<div class="ag"><h3>${ic(p)} ${esc(nm(p))}</h3>${rs.map(r => `<label class="alt-r"><input type="checkbox" data-act="lock" data-id="${r.id}"${L[r.id] ? "" : " checked"}>
      <span><b>${esc(r[S.lang])}</b> <small>${esc(DB.buildings[r.building][S.lang])}</small><br><small class="io">${fmtIO(r.in)} → ${fmtIO(r.out)}</small></span></label>`).join("")}</div>`;
  }).join("") || `<p class="hint">Ninguna coincide.</p>`;
}

// ---------- acciones
function applyPreset() {
  const name = $("preset").value, base = Math.max(0, +$("base").value || 0);
  const used = new Set(); DB.recipes.forEach(r => Object.keys(r.in).forEach(i => used.add(i)));
  const list = name === "Vacío" ? [] : name === "Todas las piezas finales" ? Object.keys(DB.items).filter(i => !DB.items[i].raw && !DB.items[i].manual && !DB.items[i].synthetic && !used.has(i) && !/Waste/.test(DB.items[i].en) && (Engine.PRIM[i] || []).length) : (PHASES.find(p => p[0] === name) || [, []])[1];
  set(() => { S.preset = name; P().targets = list.map(item => ({item, rate: base})); });
}
document.addEventListener("change", e => {
  const t = e.target, a = t.dataset.act, plan = P();
  if (a === "sel") set(() => { plan.sel[t.dataset.item] = t.value; });
  else if (a === "ext") set(() => {
    const i = t.dataset.item, c = Engine.extCfg(S.cfg, i), f = t.dataset.f;
    if (f === "wells") { const v = t.value.trim(); if (v === "" || !(+v > 0)) delete c.wells; else c.wells = Math.round(+v); }
    else c[f] = f === "clock" ? Math.min(2.5, Math.max(0.01, (+t.value || 100) / 100)) : t.value;
    S.cfg.ext[i] = c;
  });
  else if (a === "limit") set(() => { const v = t.value.trim(); if (v === "") delete S.cfg.limits[t.dataset.item]; else S.cfg.limits[t.dataset.item] = Math.max(0, +v); });
  else if (a === "trate") set(() => { plan.targets[+t.dataset.k].rate = Math.max(0, +t.value || 0); });
  else if (a === "rclock") set(() => { const rc = plan.rc[t.dataset.id] = plan.rc[t.dataset.id] || {}; rc.clock = Math.min(2.5, Math.max(0.01, (+t.value || 100) / 100)); });
  else if (a === "rsloop") set(() => { const rc = plan.rc[t.dataset.id] = plan.rc[t.dataset.id] || {}; rc.sloops = Math.max(0, Math.round(+t.value || 0)); });
  else if (a === "lock") set(() => { if (t.checked) delete S.cfg.locked[t.dataset.id]; else S.cfg.locked[t.dataset.id] = true; });
  else if (t.id === "plan") set(() => { S.cur = +t.value; });
  else if (t.id === "pname") set(() => { P().name = t.value.trim() || "Sin nombre"; });
  else if (t.id === "clock") set(() => { S.cfg.clock = Math.min(2.5, Math.max(0.01, (+t.value || 100) / 100)); });
  else if (t.id === "belt" || t.id === "pipe") set(() => { S.cfg[t.id] = t.value; });
  else if (t.id === "lang" || t.id === "icons" || t.id === "group") set(() => { S[t.id] = t.value; });
  else if (t.id === "objective") set(() => { plan.objective = t.value; });
  else if (t.id === "maximize" || t.id === "allowManual") set(() => { plan[t.id] = t.checked; });
  else if (t.id === "energy") set(() => { plan.energy = t.value; });
  else if (t.id === "gridMW") set(() => { plan.gridMW = Math.max(0, +t.value || 0); });
  else if (t.id === "af") renderAlts();
  else if (t.id === "dbfile" && t.files[0]) t.files[0].text().then(x => { const d = JSON.parse(x); if (!d.recipes || !d.items || !d.buildings) throw new Error("formato no válido"); loadDB(d); costCache.clear(); render(); $("dbinfo").textContent = "Base de datos cargada desde archivo."; }).catch(err => { $("dbinfo").textContent = "No se pudo cargar: " + err.message; });
  else if (t.id === "cfgfile" && t.files[0]) t.files[0].text().then(x => importState(x));
});
document.addEventListener("input", e => { if (e.target.id === "q") filterProd(); if (e.target.id === "aq") renderAlts(); });
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  const a = t.dataset.act, plan = P();
  if (t.dataset.t) set(() => { S.tab = t.dataset.t; });
  else if (a === "tdel") set(() => { plan.targets.splice(+t.dataset.k, 1); });
  else if (a === "ban") set(() => { plan.ban[t.dataset.id] = true; });
  else if (a === "unban") set(() => { plan.ban = {}; });
  else if (t.id === "apply") applyPreset();
  else if (t.id === "add") {
    const id = idByName($("addItem").value), rate = Math.max(0, +$("addRate").value || 0);
    if (!id) { $("addItem").setCustomValidity("Ese objeto no existe"); $("addItem").reportValidity(); return; }
    $("addItem").setCustomValidity("");
    set(() => { const ex = plan.targets.find(x => x.item === id); if (ex) ex.rate = rate; else plan.targets.push({item: id, rate}); });
    $("addItem").value = "";
  }
  else if (t.id === "mManual" || t.id === "mOpt") set(() => { plan.mode = t.id === "mOpt" ? "opt" : "manual"; });
  else if (t.id === "pNew") set(() => { S.plans.push(newPlan("Fábrica " + (S.plans.length + 1))); S.cur = S.plans.length - 1; });
  else if (t.id === "pDup") set(() => { const c = JSON.parse(JSON.stringify(plan)); c.name += " (copia)"; S.plans.push(c); S.cur = S.plans.length - 1; });
  else if (t.id === "pDel") {
    if (S.plans.length < 2) return;
    if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "¿Seguro?"; setTimeout(() => { t.dataset.sure = ""; t.textContent = "Borrar"; }, 3000); return; }
    t.dataset.sure = ""; t.textContent = "Borrar";
    set(() => { S.plans.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); });
  }
  else if (t.id === "undo") undo();
  else if (t.id === "limMap") set(() => { for (const [k, v] of Object.entries(DB.world)) S.cfg.limits[k] = v; });
  else if (t.id === "limNone") set(() => { S.cfg.limits = {}; });
  else if (t.id === "altAll") set(() => { S.cfg.locked = {}; });
  else if (t.id === "altNone") set(() => { for (const r of DB.recipes) if (r.alt) S.cfg.locked[r.id] = true; });
  else if (t.id === "exportS") { $("io").value = JSON.stringify(S, null, 1); navigator.clipboard?.writeText($("io").value).catch(() => {}); t.textContent = "Copiada"; setTimeout(() => t.textContent = "Copiar configuración", 1500); }
  else if (t.id === "importS") importState($("io").value);
  else if (t.id === "reset") { if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "¿Seguro? Pulsa otra vez"; setTimeout(() => { t.dataset.sure = ""; t.textContent = "Restablecer todo"; }, 3000); return; } set(() => { S = fresh(); }); loadDB(EMBED); render(); }
  else if (t.id === "dlS" || t.id === "dlDB") {
    const data = t.id === "dlS" ? S : DB, txt = JSON.stringify(data, null, t.id === "dlS" ? 1 : 0);
    $("io").value = t.id === "dlS" ? txt : $("io").value;
    try { const a2 = document.createElement("a"); a2.href = URL.createObjectURL(new Blob([txt], {type: "application/json"})); a2.download = t.id === "dlS" ? "planificador_config.json" : "satisfactory_db.json"; document.body.append(a2); a2.click(); a2.remove(); } catch (err) {}
  }
});
function importState(txt) {
  try { const s = JSON.parse(txt); if (s.v !== 2 || !Array.isArray(s.plans)) throw 0; set(() => { S = restore(s); }); $("dbinfo").textContent = "Configuración importada."; }
  catch (e) { $("dbinfo").textContent = "Esa configuración no es válida (JSON de la versión 2)."; }
}
function undo() { if (!hist.length) return; S = JSON.parse(hist.pop()); save(); render(); }
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "addItem") $("add").click();
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); undo(); }
});
$("sub").textContent = `Datos del juego (${DB.meta.source}): ${Object.keys(DB.items).length} objetos, ${DB.recipes.length} recetas, ${DB.recipes.filter(r => r.alt).length} alternativas.`;
$("dbinfo").textContent = `Base de datos generada el ${DB.meta.generated} desde los Docs del juego.`;
document.body.insertAdjacentHTML("afterbegin", Glyphs.defs());
render();
// iconos del juego opcionales: carpeta icons/ junto al HTML
// solo al abrirlo como archivo local: en la web no se publican iconos y la comprobación daría un 404 en consola
if (location.protocol === "file:") { const img = new Image(); img.onload = () => { iconsFound = true; render(); }; img.src = "icons/Desc_IronPlate_C.png"; }
}
