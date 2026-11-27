// Asesor de alternativas: cuánto mejora la fábrica al desbloquear cada alternativa bloqueada (candidatas)
// y cuánto empeora al bloquear cada desbloqueada (activas). Cada alternativa se evalúa por separado con el optimizador.
// Sin DOM: se ejecuta igual en el navegador y en Node (tests). El panel trocea la evaluación con step().
const Advisor = (() => {
  // cambio relativo del criterio por debajo del cual cuenta como «sin cambio» (0,01 %); el mismo para todos los estados
  const TOL = 1e-4;

  // única forma de cambiar un desbloqueo: la casilla de la lista y el botón del asesor usan esta función
  function setUnlocked(cfg, id, on) {
    cfg.locked = cfg.locked || {};
    if (on) delete cfg.locked[id]; else cfg.locked[id] = true;
    return cfg;
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // el asesor usa siempre el optimizador; en Manual, sin maximizar: la base es el plan óptimo con las alternativas actuales
  const basePlan = plan => Object.assign(clone(plan), plan.mode === "opt" ? {} : {mode: "opt", maximize: false});
  // criterio en el sentido «menos es mejor»: valor del LP o, con maximizar, la escala cambiada de signo
  const crit = (res, plan) => plan.maximize ? -res.scale : res.obj;

  // cifras reales del plan (máquinas enteras, reloj uniforme): o = {db, engine, report}
  function summary(o, cfg, res) {
    const A = o.engine.analyze(cfg, res);
    let mach = 0; for (const r of A.rows) if (r.p.kind === "recipe" && !r.p.b.generator) mach += r.build;
    const rep = o.report.breakdown(A, {db: o.db, lang: "es", cfg, engine: o.engine});
    return {score: A.score * 100, mw: A.energy.cons, mach, points: o.report.cost(rep, {db: o.db, lang: "es"}).points};
  }
  const ZERO = {score: 0, mw: 0, mach: 0, points: 0};

  // prepara la evaluación. opt = {mode: "cand" | "act", ids?: [...] (mi lista; solo candidatas)}
  // Atajos exactos (no resuelven):
  //  - una alternativa sin ninguna salida (subproductos incluidos) entre los objetos que alcanza la búsqueda del optimizador
  //    (Engine.reach: recetas permitidas y no excluidas, más la energía si se genera) no entra en el LP: nada cambia;
  //  - una activa que la base no usa no cambia el óptimo al quitarla; con pozos indicados no se aplica, porque el punto fijo
  //    de los Pressurizers depende del camino y quitarla podría llevar a otro reparto.
  function prepare(o, cfg0, plan0, opt) {
    const E = o.engine, cfg = clone(cfg0), plan = basePlan(plan0), mode = opt.mode;
    const t0 = Date.now(), base = E.solveOpt(cfg, plan), reach = E.reach(cfg, plan), ban = plan.ban || {};
    const wells = Object.keys(E.pressAll(cfg)).length > 0;
    const isLocked = id => !!(cfg.locked || {})[id];
    const alts = o.db.recipes.filter(r => r.alt).map(r => r.id);
    const pool = mode === "cand" ? (opt.ids ? alts.filter(id => opt.ids.includes(id)) : alts).filter(isLocked) : alts.filter(id => !isLocked(id));
    const used = new Set(base.steps.filter(s => s.p.kind === "recipe").map(s => s.p.id));
    const job = {o, mode, cfg, plan, wells, rows: [], queue: [], done: 0, ms: 0, cancelled: false,
      base: {res: base, error: base.error, crit: base.error ? null : crit(base, plan), sum: base.error ? null : summary(o, cfg, base)}};
    // sin plan base no hay nada que empeorar; si la base ya no tiene techo (maximizar), desbloquear no le pone techo: nada que comparar
    job.blocked = !!base.error && (mode === "act" || base.error === "unbounded");
    for (const id of pool) {
      const row = {id, used: used.has(id)}, enters = !ban[id] && Object.keys(E.R[id].out).some(k => reach.has(k));
      if (job.blocked) row.state = "sinbase";
      else if (!enters) Object.assign(row, {state: mode === "cand" ? "noentra" : "nouso", why: ban[id] ? "excluida" : "noentra", rel: 0, delta: ZERO, fast: true});
      else if (mode === "act" && !row.used && !wells) Object.assign(row, {state: "nouso", why: "sinuso", rel: 0, delta: ZERO, fast: true});
      else job.queue.push(row);
      job.rows.push(row);
    }
    job.ms += Date.now() - t0;
    return job;
  }

  function evaluate(job, row) {
    const {o, plan, base} = job, E = o.engine;
    const cfg2 = setUnlocked(clone(job.cfg), row.id, job.mode === "cand");
    const res = row.res = E.solveOpt(cfg2, plan);
    row.usedNew = res.steps.some(s => s.p.id === row.id);
    // al maximizar, con (candidatas) o sin (activas) esta alternativa la escala no tiene techo: algún recurso no está limitado
    if (res.error === "unbounded") { row.error = res.error; row.state = "sinlimite"; return; }
    if (res.error) {
      row.error = res.error;
      row.state = job.mode === "act" ? "imprescindible" : base.error ? "noaporta" : "error";
      if (job.mode === "cand" && base.error) row.why = "sinsol";
      return;
    }
    row.sum = summary(o, cfg2, res); row.crit = crit(res, plan);
    if (base.error) { row.state = "viable"; return; }
    const b = base.crit, s = base.sum;
    row.rel = (row.crit - b) / Math.max(Math.abs(b), 1e-9);   // > 0: peor; < 0: mejor
    row.delta = {score: row.sum.score - s.score, mw: row.sum.mw - s.mw, mach: row.sum.mach - s.mach, points: row.sum.points - s.points};
    if (job.mode === "cand") {
      row.state = row.rel < -TOL ? "mejora" : row.rel > TOL ? "empeora" : "noaporta";
      if (row.state === "noaporta") row.why = row.usedNew ? "singanancia" : "nolausa";
    } else row.state = row.rel > TOL ? "importa" : row.rel < -TOL ? "mejorsin" : row.used ? "prescindible" : "nouso";
    if (row.state === "nouso") row.why = "sinuso";
  }

  // evalúa trabajos de la cola durante como mucho «budget» ms (al menos uno); true = terminado
  function step(job, budget = 40, now = Date.now) {
    const t = now();
    while (!job.cancelled && job.done < job.queue.length) { evaluate(job, job.queue[job.done++]); if (now() - t >= budget) break; }
    job.ms += now() - t;
    return finished(job);
  }
  const finished = job => job.cancelled || job.done >= job.queue.length;
  const cancel = job => { job.cancelled = true; };
  function run(job) { while (!step(job, Infinity)); return job; }

  // estados que se muestran arriba (el resto va al grupo plegado), en orden
  const MAIN = {cand: ["sinlimite", "viable", "mejora", "empeora", "error"], act: ["sinlimite", "imprescindible", "importa", "mejorsin", "prescindible"]};
  // filas evaluadas (o resueltas por atajo), ordenadas: primero las de más efecto
  function groups(job) {
    const ev = job.rows.filter(r => r.state && r.state !== "sinbase"), M = MAIN[job.mode];
    // candidatas: de más a menos mejora; activas: de más a menos empeoramiento.
    // «Sin límite» / «Hace posible» / «imprescindible» arriba, errores al final
    const key = r => job.mode === "cand" ? r.rel ?? 0 : -(r.rel ?? 0);
    const pri = s => s === "sinlimite" || s === "viable" || s === "imprescindible" ? 0 : s === "error" ? 2 : 1;
    const main = ev.filter(r => M.includes(r.state)).sort((a, b) => pri(a.state) - pri(b.state) || key(a) - key(b));
    const rest = ev.filter(r => !M.includes(r.state));
    return {main, rest, pending: job.rows.filter(r => !r.state).length};
  }
  return {TOL, setUnlocked, basePlan, crit, summary, prepare, evaluate, step, run, cancel, finished, groups};
})();
if (typeof module !== "undefined") module.exports = Advisor;
