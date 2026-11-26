// Glifos propios (sin material del juego): una forma por familia de objeto, coloreada según sus materias primas.
const Glyphs = (() => {
  const L = 'fill="#fff" opacity=".38"', D = 'fill="#000" opacity=".28"', S = 'stroke="#000" stroke-opacity=".45" stroke-width="1.1" stroke-linejoin="round"';
  const gear = (() => { let p = ""; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 7.2 : 9.6; p += (i ? "L" : "M") + (12 + r * Math.cos(a)).toFixed(2) + " " + (12 + r * Math.sin(a)).toFixed(2); } return p + "Z"; })();
  const SHAPES = {
    ore: `<path d="M3.5 15.5 6.5 7 13 3.8l6.6 4 1.9 7.6-6 5.2H8.2Z" fill="currentColor" ${S}/><path d="M6.5 7 13 3.8l6.6 4-6.1 2.4Z" ${L}/><path d="M13.5 10.2 21.5 15.4l-6 5.2Z" ${D}/>`,
    ingot: `<path d="M2.5 16.5 6 9h12l3.5 7.5Z" fill="currentColor" ${S}/><path d="M6 9h12l-2 3H8Z" ${L}/><path d="M18 9l3.5 7.5H18l-2-4.5Z" ${D}/>`,
    plate: `<path d="M2.5 11.5 12 6.5l9.5 5-9.5 5Z" fill="currentColor" ${S}/><path d="M2.5 11.5v2l9.5 5 9.5-5v-2l-9.5 5Z" fill="currentColor" ${S}/><path d="M2.5 13.5l9.5 5v-2l-9.5-5Z" ${D}/><path d="M6.5 11.3 12 8.5l3.2 1.7-5.5 2.8Z" ${L}/>`,
    rod: `<path d="M4 17.5 17.5 4l2.5 2.5L6.5 20Z" fill="currentColor" ${S}/><path d="M4 17.5 17.5 4l1 1L5 18.5Z" ${L}/>`,
    beam: `<path d="M5 4h14v3h-5v10h5v3H5v-3h5V7H5Z" fill="currentColor" ${S}/><path d="M5 4h14v1.2H5Z" ${L}/><path d="M12.6 7H14v10h-1.4Z" ${D}/>`,
    pipe: `<path d="M4 9.5h14a2.5 2.5 0 0 1 0 5H4Z" fill="currentColor" ${S}/><ellipse cx="4" cy="12" rx="2" ry="2.5" fill="currentColor" ${S}/><ellipse cx="4" cy="12" rx="1" ry="1.3" ${D}/><path d="M5 9.5h13v1.4H5Z" ${L}/>`,
    wire: `<g fill="none" stroke="currentColor" stroke-width="2.6"><path d="M4 16c3-9 5 7 8-2s5 7 8-2"/></g><path d="M4 16c3-9 5 7 8-2s5 7 8-2" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>`,
    cable: `<circle cx="12" cy="12" r="8.5" fill="currentColor" ${S}/><circle cx="12" cy="12" r="5" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.6"/><circle cx="12" cy="12" r="2" ${D}/><path d="M6 7.5a8 8 0 0 1 7-3" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.6"/>`,
    screw: `<path d="M8 3.5h8l1.5 3-1.5 3H8L6.5 6.5Z" fill="currentColor" ${S}/><path d="M10.2 9.5h3.6V20l-1.8 1.5-1.8-1.5Z" fill="currentColor" ${S}/><path d="M10.2 12l3.6-1M10.2 15l3.6-1M10.2 18l3.6-1" stroke="#000" stroke-opacity=".4"/><path d="M8 3.5h8l1.5 3h-11Z" ${L}/>`,
    powder: `<path d="M3 19c1.5-6 5-10 9-10s7.5 4 9 10Z" fill="currentColor" ${S}/><path d="M7 14c1.5-2.5 3-3.6 5-3.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.6"/><circle cx="15" cy="15.5" r="1" ${D}/><circle cx="10" cy="16.8" r=".9" ${D}/><circle cx="17.5" cy="18" r=".8" ${D}/>`,
    crystal: `<path d="M12 2.5 19 8.5 12 21.5 5 8.5Z" fill="currentColor" ${S}/><path d="M5 8.5h14L12 2.5Z" ${L}/><path d="M12 8.5 19 8.5 12 21.5Z" ${D}/>`,
    frame: `<path d="M4 4h16v16H4Z M8 8v8h8V8Z" fill="currentColor" fill-rule="evenodd" ${S}/><path d="M4 4h16l-4 4H8Z" ${L}/><path d="M20 4v16l-4-4V8Z" ${D}/>`,
    gear: `<path d="${gear}" fill="currentColor" ${S}/><circle cx="12" cy="12" r="3.2" fill="#000" opacity=".35"/><path d="M6.5 8.5a7 7 0 0 1 5-3.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.6"/>`,
    chip: `<rect x="5.5" y="5.5" width="13" height="13" rx="1.5" fill="currentColor" ${S}/><path d="M8 3v2.5M12 3v2.5M16 3v2.5M8 18.5V21M12 18.5V21M16 18.5V21M3 8h2.5M3 12h2.5M3 16h2.5M18.5 8H21M18.5 12H21M18.5 16H21" stroke="currentColor" stroke-width="1.6"/><rect x="9" y="9" width="6" height="6" rx=".8" ${D}/><path d="M5.5 7a1.5 1.5 0 0 1 1.5-1.5h11.5V7Z" ${L}/>`,
    drop: `<path d="M12 2.5c4 5.5 6.5 9 6.5 12.2a6.5 6.5 0 0 1-13 0C5.5 11.5 8 8 12 2.5Z" fill="currentColor" ${S}/><path d="M9 13.5a3.5 3.5 0 0 0 2 4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>`,
    gas: `<circle cx="8.5" cy="14" r="4.5" fill="currentColor" ${S}/><circle cx="15" cy="10.5" r="5.5" fill="currentColor" ${S}/><circle cx="16" cy="16.5" r="3.6" fill="currentColor" ${S}/><circle cx="13.5" cy="8.5" r="1.6" ${L}/>`,
    canister: `<rect x="6" y="5" width="12" height="16" rx="2.5" fill="currentColor" ${S}/><rect x="9.5" y="2.5" width="5" height="3" rx=".8" fill="currentColor" ${S}/><path d="M6 10h12v2H6Z" ${D}/><path d="M8 7v12" stroke="#fff" stroke-opacity=".45" stroke-width="1.5"/>`,
    nuclear: `<rect x="8" y="2.5" width="8" height="19" rx="2" fill="currentColor" ${S}/><circle cx="12" cy="12" r="3.3" fill="#000" opacity=".3"/><path d="M12 12 13.6 9.2M12 12h-3.2M12 12l1.6 2.8" stroke="#fff" stroke-opacity=".8" stroke-width="1.4"/><path d="M9.5 4.5v15" stroke="#fff" stroke-opacity=".4" stroke-width="1.2"/>`,
    orb: `<circle cx="12" cy="12" r="6.5" fill="currentColor" ${S}/><ellipse cx="12" cy="12" rx="10" ry="3.4" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-25 12 12)"/><circle cx="10" cy="9.5" r="2" ${L}/>`,
    ammo: `<path d="M9 21V10c0-4 1.5-6.5 3-7.5 1.5 1 3 3.5 3 7.5v11Z" fill="currentColor" ${S}/><path d="M9 17h6v4H9Z" ${D}/><path d="M10.5 9.5c0-2.5.6-4 1.5-5" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>`,
    bio: `<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16Z" fill="currentColor" ${S}/><path d="M5 19 16 8" stroke="#000" stroke-opacity=".35" stroke-width="1.3"/><path d="M8 13c1-3 3.5-5.5 7-6.5" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/>`,
    shard: `<path d="M12 2 18 12 12 22 6 12Z" fill="currentColor" ${S}/><path d="M12 2 18 12H6Z" ${L}/><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/>`,
    bolt: `<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2Z" fill="currentColor" ${S}/><path d="M13.5 2 5 13.5h3.2L12.8 4.6Z" ${L}/>`,
    box: `<path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9Z" fill="currentColor" ${S}/><path d="M3.5 7.5 12 12.2l8.5-4.7L12 2.8Z" ${L}/><path d="M12 12.2v9l8.5-4.7v-9Z" ${D}/>`,
  };
  const RULES = [
    [/^Packaged |^Empty (Canister|Fluid Tank)/, "canister"],
    [/Fuel Rod|^Uranium|Plutonium|Ficsonium|Non-Fissile|Encased .*Cell/, "nuclear"],
    [/SAM|Ficsite|Dark Matter|Singularity|Photonic|Alien Power|Superposition|Neural|Fluctuator|Time Crystal/, "orb"],
    [/Oscillator|Computer|Circuit|Limiter|Connector|Control|Processor|Server|Wiring|Director|Radio|Battery|Heat Sink|Cooling|Magnetic|Sculptor|Warp|Rocket|Cube|Pasta|Iodine|Gas Filter|Portable/, "chip"],
    [/Nobelisk|Ammo|Rebar|Cartridge/, "ammo"],
    [/Shard|Slug/, "shard"],
    [/Leaves|Wood|Mycelia|Remains|Protein|DNA|Fabric/, "bio"],
    [/Ingot/, "ingot"], [/Framework|Frame/, "frame"], [/Rotor|Stator|Motor|Engine/, "gear"],
    [/Plate|Sheet|Casing/, "plate"], [/Beam/, "beam"], [/Pipe/, "pipe"], [/Quickwire|Wire/, "wire"], [/Cable/, "cable"],
    [/Screw/, "screw"], [/Rod/, "rod"],
    [/Powder|Silica|Concrete|Compacted Coal|Petroleum Coke|Polymer Resin|Aluminum Scrap|Biomass|Biofuel/, "powder"],
    [/Crystal|Quartz Crystal|Diamond/, "crystal"],
  ];
  function shape(it) {
    if (it.form === "power") return "bolt";
    if (it.form === "liquid") return "drop";
    if (it.form === "gas") return "gas";
    if (it.raw) return "ore";
    for (const [re, s] of RULES) if (re.test(it.en)) return s;
    return "box";
  }
  const MANUALCOL = {Desc_Leaves_C: "#4f9a3a", Desc_Wood_C: "#8a5a32", Desc_Mycelia_C: "#9b74d6", Desc_HogParts_C: "#b0675a", Desc_SpitterParts_C: "#c9743d",
    Desc_HatcherParts_C: "#7f8a4a", Desc_StingerParts_C: "#6f5a8a", Desc_Crystal_C: "#53b8ff", Desc_Crystal_mk2_C: "#ffd54a", Desc_Crystal_mk3_C: "#c45bff"};
  // color: mezcla de los colores de sus materias primas (receta por defecto)
  function colors(db, E) {
    const memo = {}, hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const comp = (i, st) => {
      if (memo[i]) return memo[i];
      const it = db.items[i];
      if (it.color || MANUALCOL[i]) return memo[i] = {[i]: 1};
      if (st.has(i)) return {};
      st.add(i);
      const sel = E.defaultSel({locked: {}}, i), r = E.R[sel];
      const out = {};
      if (r) { const q = r.out[i]; for (const [j, v] of Object.entries(r.in)) { const c = comp(j, st); for (const k in c) out[k] = (out[k] || 0) + c[k] * v / q; } }
      st.delete(i); return memo[i] = out;
    };
    const res = {};
    for (const [k, it] of Object.entries(db.items)) {
      if (it.color) { res[k] = it.color; continue; }
      if (MANUALCOL[k]) { res[k] = MANUALCOL[k]; continue; }
      const c = comp(k, new Set()); let w = 0, rgb = [0, 0, 0];
      for (const [j, v] of Object.entries(c)) { if (j === "Desc_Water_C") continue; const cj = db.items[j].color || MANUALCOL[j]; if (!cj) continue; const s = Math.sqrt(v); w += s; hex(cj).forEach((x, n) => rgb[n] += x * s); }
      res[k] = w ? "#" + rgb.map(x => Math.round(x / w).toString(16).padStart(2, "0")).join("") : "#8c8c8c";
    }
    return res;
  }
  const defs = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(SHAPES).map(([k, v]) => `<symbol id="g-${k}" viewBox="0 0 24 24">${v}</symbol>`).join("")}</defs></svg>`;
  return {shape, colors, defs, SHAPES};
})();
if (typeof module !== "undefined") module.exports = Glyphs;
