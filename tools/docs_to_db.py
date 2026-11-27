"""Genera data/satisfactory_db.json a partir de los Docs oficiales del juego.

Uso:  python docs_to_db.py "<Satisfactory>/CommunityResources/Docs" ../data/satisfactory_db.json
Lee en-US.json y es-ES.json (UTF-16). Solo incluye recetas de máquinas de producción
(sin edificios, equipo ni FICSMAS) y añade cada generador con cada combustible como receta
(combustible + agua -> Power_MW + residuo). También guarda el coste de construcción (receta de la Build Gun)
de cada edificio que usa el planificador (buildCosts) y los nombres de Power Shard, Somersloop y Equipment Workshop.
"""
import json, re, sys, os

DOCS, OUT = sys.argv[1], sys.argv[2]

def load(lang):
    raw = open(os.path.join(DOCS, f"{lang}.json"), "rb").read()
    enc = "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
    return {e["NativeClass"].split(".")[-1].rstrip("'"): e["Classes"] for e in json.loads(raw.decode(enc))}

EN, ES = load("en-US"), load("es-ES")
es_name = {}
for cls, lst in ES.items():
    for c in lst:
        if "mDisplayName" in c: es_name[c["ClassName"]] = c["mDisplayName"]

def cls_of(path):  # ".../Desc_IronPlate.Desc_IronPlate_C'" -> Desc_IronPlate_C
    return path.rstrip("'\"").split(".")[-1]

def parse_amounts(s):
    return [(cls_of(a), float(b)) for a, b in re.findall(r'ItemClass="([^"]+)",Amount=(\d+(?:\.\d+)?)', s or "")]

def f(x, d=0.0):
    try: return float(x)
    except (TypeError, ValueError): return d

# ---------- objetos
ITEM_CLASSES = [k for k in EN if k.startswith("FGItemDescriptor") or k in (
    "FGResourceDescriptor", "FGConsumableDescriptor", "FGEquipmentDescriptor", "FGPowerShardDescriptor",
    "FGAmmoTypeProjectile", "FGAmmoTypeInstantHit", "FGAmmoTypeSpreadshot")]
items = {}
for k in ITEM_CLASSES:
    for c in EN[k]:
        form = {"RF_SOLID": "solid", "RF_LIQUID": "liquid", "RF_GAS": "gas"}.get(c.get("mForm"), "solid")
        col = c.get("mGasColor" if form == "gas" else "mFluidColor", "")
        m = dict(re.findall(r"([RGBA])=(\d+)", col or ""))
        icon = (c.get("mSmallIcon") or "").split(" ")[-1].split(".")[0].split("/")
        items[c["ClassName"]] = {
            "en": c["mDisplayName"], "es": es_name.get(c["ClassName"], c["mDisplayName"]), "form": form,
            "raw": k == "FGResourceDescriptor", "sink": int(f(c.get("mResourceSinkPoints"))),
            "color": "#%02x%02x%02x" % (int(m.get("R", 0)), int(m.get("G", 0)), int(m.get("B", 0))) if form != "solid" and m else None,
            "icon": icon[-1] if icon and icon[-1] else None,
            "iconPath": "/".join(icon[1:-1]) if len(icon) > 2 else None,
            "energy": f(c.get("mEnergyValue")),
        }

# ---------- máquinas
buildings = {}
for k in ("FGBuildableManufacturer", "FGBuildableManufacturerVariablePower"):
    for c in EN[k]:
        buildings[c["ClassName"]] = {
            "en": c["mDisplayName"], "es": es_name.get(c["ClassName"], c["mDisplayName"]),
            "power": f(c.get("mPowerConsumption")), "exp": f(c.get("mPowerConsumptionExponent"), 1.321929),
            "slots": int(f(c.get("mProductionShardSlotSize"))), "boost": f(c.get("mProductionShardBoostMultiplier")),
            "boostExp": f(c.get("mProductionBoostPowerConsumptionExponent"), 2), "variable": k.endswith("VariablePower"),
        }
# generadores con combustible (Biomass Burner, carbón, combustible, nuclear): potencia negativa = producción
GENS = [c for k in ("FGBuildableGeneratorFuel", "FGBuildableGeneratorNuclear") for c in EN[k]]
for g in GENS:
    buildings[g["ClassName"]] = {"en": g["mDisplayName"], "es": es_name.get(g["ClassName"], g["mDisplayName"]),
        "power": -f(g["mPowerProduction"]), "exp": 1, "slots": 0, "boost": 0, "boostExp": 2, "variable": False, "generator": True}

# ---------- desbloqueos (esquemas)
unlock = {}
for s in EN["FGSchematic"]:
    for u in s.get("mUnlocks", []):
        for r in re.findall(r"([A-Za-z0-9_]+_C)'", u.get("mRecipes", "")):
            prev = unlock.get(r)
            info = {"type": s["mType"].replace("EST_", ""), "tier": int(f(s.get("mTechTier"))), "en": s["mDisplayName"],
                    "es": es_name.get(s["ClassName"], s["mDisplayName"])}
            if not prev or (prev["type"] != "Alternate" and info["type"] == "Alternate"): unlock[r] = info

# ---------- recetas
recipes = []
for c in EN["FGRecipe"]:
    if "EV_Christmas" in (c.get("mRelevantEvents") or ""): continue
    made = [cls_of(p) for p in re.findall(r'"([^"]+)"', c.get("mProducedIn") or "")]
    made = [m for m in made if m in buildings]
    if not made: continue
    dur = f(c["mManufactoringDuration"])
    def per_min(lst):
        out = {}
        for it, a in lst:
            if it not in items: return None
            q = a / (1000 if items[it]["form"] != "solid" else 1) * 60 / dur
            out[it] = round(out.get(it, 0) + q, 6)
        return out
    if re.search(r"Xmas|Ficsmas|Gift|Snow|Candy|Firework", c["mIngredients"] + c["mProduct"] + c["ClassName"], re.I): continue
    ins, outs = per_min(parse_amounts(c["mIngredients"])), per_min(parse_amounts(c["mProduct"]))
    if ins is None or outs is None or not outs: continue
    b = made[0]
    u = unlock.get(c["ClassName"], {})
    name_en, name_es = c["mDisplayName"], es_name.get(c["ClassName"], c["mDisplayName"])
    alt = u.get("type") == "Alternate"
    r = {"id": c["ClassName"], "en": re.sub(r"^Alternate: ", "", name_en), "es": re.sub(r"^Alternativa: ", "", name_es),
         "alt": alt, "building": b, "time": dur, "in": ins, "out": outs,
         "unlock": {"type": u.get("type", "?"), "tier": u.get("tier", 0), "en": u.get("en", ""), "es": u.get("es", "")}}
    if buildings[b]["variable"]:
        lo = f(c.get("mVariablePowerConsumptionConstant")); hi = lo + f(c.get("mVariablePowerConsumptionFactor"))
        r["powerRange"] = [lo, hi]; r["power"] = (lo + hi) / 2
    recipes.append(r)

# generadores: una receta por combustible. Power_MW es un objeto sintético (MW) que el motor reparte entre las máquinas
POWER = "Power_MW"
items[POWER] = {"en": "Power", "es": "Energía", "form": "power", "raw": False, "sink": 0, "color": "#f2c230",
                "icon": None, "iconPath": None, "energy": 0, "synthetic": True}
bld_recipe = {}  # Desc_<edificio>_C -> receta del edificio (para saber qué hito lo desbloquea)
for c in EN["FGRecipe"]:
    for it, _ in parse_amounts(c.get("mProduct")): bld_recipe.setdefault(it, c["ClassName"])
for g in GENS:
    pw = f(g["mPowerProduction"]); gu = unlock.get(bld_recipe.get("Desc_" + g["ClassName"][6:], ""), {})
    for fu in g["mFuel"]:
        fuel, waste, sup = fu["mFuelClass"], fu.get("mByproduct"), fu.get("mSupplementalResourceClass")
        if fuel not in items: continue
        e = items[fuel]["energy"] * (1000 if items[fuel]["form"] != "solid" else 1)  # Docs: MJ por unidad o por litro
        if e <= 0: continue
        rate = pw * 60 / e
        ins = {fuel: round(rate, 6)}
        if sup and g.get("mRequiresSupplementalResource") == "True": ins[sup] = round(pw * f(g["mSupplementalToPowerRatio"]) * 60 / 1000, 6)
        outs = {POWER: pw}
        if waste: outs[waste] = round(rate * f(fu["mByproductAmount"]), 6)
        bname = buildings[g["ClassName"]]
        recipes.append({"id": "Gen_" + fuel, "en": f'{items[fuel]["en"]} ({bname["en"]})', "es": f'{items[fuel]["es"]} ({bname["es"]})',
            "alt": False, "building": g["ClassName"], "time": e / pw, "in": ins, "out": outs,
            "unlock": {"type": gu.get("type", "Milestone"), "tier": gu.get("tier", 0), "en": gu.get("en", ""), "es": gu.get("es", "")}})

used = set()
for r in recipes: used |= set(r["in"]) | set(r["out"])
# ---------- extractores
ex = {c["ClassName"]: c for k in ("FGBuildableResourceExtractor", "FGBuildableWaterPump", "FGBuildableFrackingExtractor") for c in EN[k]}
def rate(c, liquid): return f(c["mItemsPerCycle"]) / f(c["mExtractCycleTime"]) * 60 / (1000 if liquid else 1)
raw_solid = [k for k, v in items.items() if v["raw"] and v["form"] == "solid"]
press = EN["FGBuildableFrackingActivator"][0]
extractors = {
  "miner": {"tiers": {f"Mk.{n}": {"id": f"Build_MinerMk{n}_C", "rate": rate(ex[f"Build_MinerMk{n}_C"], False), "power": f(ex[f"Build_MinerMk{n}_C"]["mPowerConsumption"])} for n in (1, 2, 3)},
            "items": raw_solid, "en": "Miner", "es": es_name.get("Build_MinerMk1_C", "Minero").replace(" Mk.1", "")},
  "water": {"rate": rate(ex["Build_WaterPump_C"], True), "power": f(ex["Build_WaterPump_C"]["mPowerConsumption"]), "items": ["Desc_Water_C"], "purity": False,
            "en": "Water Extractor", "es": es_name.get("Build_WaterPump_C")},
  "oil": {"rate": rate(ex["Build_OilPump_C"], True), "power": f(ex["Build_OilPump_C"]["mPowerConsumption"]), "items": ["Desc_LiquidOil_C"], "purity": True,
          "en": "Oil Extractor", "es": es_name.get("Build_OilPump_C")},
  "well": {"rate": rate(ex["Build_FrackingExtractor_C"], True), "power": 0, "items": ["Desc_LiquidOil_C", "Desc_NitrogenGas_C", "Desc_Water_C"], "purity": True,
           "en": "Resource Well Extractor", "es": es_name.get("Build_FrackingExtractor_C"), "pressurizer": f(press["mPowerConsumption"]),
           "pressurizerExp": f(press.get("mPowerConsumptionExponent"), 1.321929), "pressurizerName": {"en": press["mDisplayName"], "es": es_name.get(press["ClassName"], press["mDisplayName"])}},
}
for k, cls in (("water", "Build_WaterPump_C"), ("oil", "Build_OilPump_C"), ("well", "Build_FrackingExtractor_C")): extractors[k]["id"] = cls
extractors["well"]["pressurizerId"] = press["ClassName"]

# ---------- coste de construcción: receta de la Build Gun de cada edificio que usa el planificador (Build_X_C <- Desc_X_C)
BUILD_CLASSES = list(buildings) + [t["id"] for t in extractors["miner"]["tiers"].values()] + [extractors[k]["id"] for k in ("water", "oil", "well")] + [press["ClassName"]]
build_costs, workshop_made = {}, set()
for c in EN["FGRecipe"]:
    made = [cls_of(p) for p in re.findall(r'"([^"]+)"', c.get("mProducedIn") or "")]
    if "BP_WorkshopComponent_C" in made: workshop_made |= {it for it, _ in parse_amounts(c.get("mProduct"))}
    if "BP_BuildGun_C" not in made: continue
    for it, _ in parse_amounts(c.get("mProduct")):
        b = "Build_" + it[5:] if it.startswith("Desc_") else None
        if b in BUILD_CLASSES: build_costs[b] = {i: int(a) for i, a in parse_amounts(c["mIngredients"])}
missing = [b for b in BUILD_CLASSES if b not in build_costs]
if missing: sys.exit(f"Sin coste de construcción: {missing}")
cost_items = {i for cost in build_costs.values() for i in cost}
# objetos especiales: Power Shards y Somersloops (se colocan en las máquinas; el Somersloop no es una pieza de receta)
shard_c = [c for c in EN["FGPowerShardDescriptor"] if c["ClassName"] == "Desc_CrystalShard_C"][0]
sloop_c = [c for c in EN["FGPowerShardDescriptor"] if c["ClassName"] == "Desc_WAT1_C"][0]
workshop_c = [c for lst in EN.values() for c in lst if c["ClassName"] == "Build_Workshop_C"] or [{"ClassName": "Build_Workshop_C", "mDisplayName": "Equipment Workshop"}]
specials = {"shard": {"id": shard_c["ClassName"], "en": shard_c["mDisplayName"], "es": es_name.get(shard_c["ClassName"], shard_c["mDisplayName"])},
            "sloop": {"id": sloop_c["ClassName"], "en": sloop_c["mDisplayName"], "es": es_name.get(sloop_c["ClassName"], sloop_c["mDisplayName"])},
            "workshop": {"id": workshop_c[0]["ClassName"], "en": workshop_c[0]["mDisplayName"], "es": es_name.get(workshop_c[0]["ClassName"], workshop_c[0]["mDisplayName"])}}

# ---------- progreso: qué hitos, nodos del MAM y alternativas desbloquean cada receta y edificio del planificador
# Tipos: start (planos iniciales), hub (mejoras del HUB, tier 0), ms (hitos), mam (nodos del MAM), alt (alternativas de disco duro).
# Los esquemas «de fondo» (EST_Custom concedidos por otro con BP_UnlockSchematic_C) se suman al que los concede.
SCH = {s["ClassName"]: s for s in EN["FGSchematic"]}
def sch_ids(txt): return re.findall(r"([A-Za-z0-9_\-]+_C)'", txt or "")
def sch_recipes(sid): return [r for u in SCH[sid]["mUnlocks"] if u["Class"] == "BP_UnlockRecipe_C" for r in sch_ids(u.get("mRecipes"))]
def sch_grants(sid): return [x for u in SCH[sid]["mUnlocks"] if u["Class"] == "BP_UnlockSchematic_C" for x in sch_ids(u.get("mSchematics"))]
granted_by = {}
for _sid in SCH:
    for _g in sch_grants(_sid): granted_by.setdefault(_g, []).append(_sid)
def sch_deps(sid):  # una dependencia de un esquema de fondo equivale a la del esquema que lo concede
    out = []
    for x in (x for d in SCH[sid]["mSchematicDependencies"] for x in sch_ids(d.get("mSchematics"))):
        if x in SCH and SCH[x]["mType"] == "EST_Custom" and len(granted_by.get(x, [])) == 1: x = granted_by[x][0]
        out.append(x)
    return out
def sch_tree(sid):
    m = re.search(r"/Schematics/Research/([^/]+)/", SCH[sid]["FullName"]); return m.group(1) if m else None
def folded(sid, seen=None):  # recetas propias + las de los esquemas de fondo que concede (transitivo)
    seen = seen or set(); seen.add(sid); out = list(sch_recipes(sid))
    for g in sch_grants(sid):
        if g in SCH and SCH[g]["mType"] == "EST_Custom" and g not in seen: out += folded(g, seen)
    return out
KIND = {"EST_Milestone": "ms", "EST_Tutorial": "hub", "EST_MAM": "mam"}
def kind_of(sid):
    s = SCH[sid]
    if sid == "Schematic_StartingRecipes_C": return "start"
    if s["mType"] == "EST_MAM" and s["mDisplayName"].startswith("Discontinued"): return None   # nodos retirados del árbol
    return KIND.get(s["mType"])
by_rec = {}   # receta -> esquemas de progreso que la dan
for sid in SCH:
    k = kind_of(sid)
    if k:
        for r in folded(sid): by_rec.setdefault(r, set()).add(sid)
rec_ids = {r["id"] for r in recipes}
bld_ids = set(BUILD_CLASSES) | {f"Build_ConveyorBeltMk{n}_C" for n in range(1, 7)} | {"Build_Pipeline_C", "Build_PipelineMK2_C"}
bld_of = {}   # Build_X_C -> receta de la Build Gun
for c in EN["FGRecipe"]:
    if "BP_BuildGun_C" in (c.get("mProducedIn") or ""):
        for it, _ in parse_amounts(c.get("mProduct")):
            if it.startswith("Desc_") and "Build_" + it[5:] in bld_ids: bld_of["Build_" + it[5:]] = c["ClassName"]
p_bld = {b: sorted(by_rec.get(bld_of.get(b), ())) for b in sorted(bld_ids)}
if [b for b, w in p_bld.items() if not w]: sys.exit(f"Edificios sin hito que los desbloquee: {[b for b, w in p_bld.items() if not w]}")
# alternativas (disco duro): sus dependencias son las condiciones para que un disco duro te la ofrezca (todas)
p_alt, p_rec = {}, {}
for sid, s in SCH.items():
    if s["mType"] != "EST_Alternate": continue
    rs = [r for r in sch_recipes(sid) if r in rec_ids]
    if not rs: continue
    p_alt[sid] = {"deps": sch_deps(sid), "recipes": rs}
    for r in rs: p_rec.setdefault(r, {}).setdefault("drive", []).append(sid)
    # esquemas de fondo que concede una alternativa (Sílice destilada con «Quartz Purification»): van con su receta
    for g in sch_grants(sid):
        for r in (folded(g) if g in SCH else []):
            if r in rec_ids: p_rec.setdefault(r, {})["with"] = rs[0]
for r in rec_ids:
    if r in by_rec: p_rec.setdefault(r, {})["ways"] = sorted(by_rec[r])
orphan = [r["id"] for r in recipes if not r["id"].startswith("Gen_") and r["id"] not in p_rec]
if orphan: sys.exit(f"Recetas sin hito, nodo ni alternativa que las desbloquee: {orphan}")
# esquemas que se muestran: los que dan recetas o edificios del planificador, más los que piden las alternativas
# y los nodos del MAM de overclock y Somersloops
feat = {}
for sid, s in SCH.items():
    for u in s["mUnlocks"]:
        if u["Class"] == "BP_UnlockBuildOverclock_C": feat["overclock"] = sid
        if u["Class"] == "BP_UnlockBuildProductionBoost_C": feat["sloop"] = sid
used_sch = {x for w in p_rec.values() for x in w.get("ways", [])} | {x for w in p_bld.values() for x in w} | {d for a in p_alt.values() for d in a["deps"]} | set(feat.values())
bad = [x for x in used_sch if not kind_of(x)]
if bad: sys.exit(f"Dependencias de un tipo inesperado: {bad}")
p_sch = {}
for sid in sorted(used_sch):
    s = SCH[sid]; k = kind_of(sid)
    e = {"t": k, "tier": int(f(s["mTechTier"])) if k in ("ms",) else 0, "en": s["mDisplayName"], "es": es_name.get(sid, s["mDisplayName"])}
    if k == "mam": e["tree"] = sch_tree(sid)
    p_sch[sid] = e
# árboles del MAM: nombres propios (los Docs no exportan los árboles) y nodos en orden de clase
TREES = {"Caterium_RS": ("Caterium", "Caterio"), "Quartz_RS": ("Quartz", "Cuarzo"), "Sulfur_RS": ("Sulfur", "Azufre"), "Mycelia_RS": ("Mycelia", "Micelios"),
         "PowerSlugs_RS": ("Power Slugs", "Babosas de energía"), "AlienOrganisms_RS": ("Alien Organisms", "Organismos alienígenas"),
         "AlienTech_RS": ("Alien Technology", "Tecnología alienígena"), "Nutrients_RS": ("Nutrients", "Nutrientes")}
natkey = lambda x: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", x)]
p_trees = {}
for sid, e in p_sch.items():
    if e["t"] == "mam":
        if e["tree"] not in TREES: sys.exit(f"Árbol del MAM sin nombre: {e['tree']}")
        p_trees.setdefault(e["tree"], {"en": TREES[e["tree"]][0], "es": TREES[e["tree"]][1], "nodes": []})["nodes"].append(sid)
for t in p_trees.values(): t["nodes"].sort(key=natkey)
p_trees = dict(sorted(p_trees.items(), key=lambda kv: kv[1]["es"]))
# fases del Space Elevator: tier más alto disponible mientras la fase n está en curso (cada fase entregada abre los dos tiers
# siguientes). No está en los Docs; fuente: satisfactory.wiki.gg/wiki/Space_Elevator. Las pruebas lo contrastan con las recetas.
progress = {"sch": p_sch, "trees": p_trees, "rec": p_rec, "bld": p_bld, "alt": p_alt, "feat": feat, "phaseTier": [2, 4, 6, 8, 9]}

purity = {"Impure": 0.5, "Normal": 1.0, "Pure": 2.0}
belts = {f"Mk.{n}": f([c for c in EN["FGBuildableConveyorBelt"] if c["ClassName"] == f"Build_ConveyorBeltMk{n}_C"][0]["mSpeed"]) / 2 for n in range(1, 7)}
pipes = {"Mk.1": f([c for c in EN["FGBuildablePipeline"] if c["ClassName"] == "Build_Pipeline_C"][0]["mFlowLimit"]) * 60,
         "Mk.2": f([c for c in EN["FGBuildablePipeline"] if c["ClassName"] == "Build_PipelineMK2_C"][0]["mFlowLimit"]) * 60}
# Máximo del mapa (Mk.3 / extractor al 250 %, mapa por defecto). Fuente: satisfactory.wiki.gg/wiki/Resource_Node y /Nitrogen_Gas
world = {"Desc_OreIron_C": 92100, "Desc_OreGold_C": 15000, "Desc_OreCopper_C": 36900, "Desc_Stone_C": 69300, "Desc_Coal_C": 42300,
         "Desc_RawQuartz_C": 13500, "Desc_Sulfur_C": 10800, "Desc_OreBauxite_C": 12300, "Desc_OreUranium_C": 2100, "Desc_SAM_C": 10200,
         "Desc_LiquidOil_C": 12600, "Desc_NitrogenGas_C": 12000}
# objetos recolectados a mano (sin receta ni extractor)
prim = {list(r["out"])[0] for r in recipes}
manual = sorted(k for k in used if not items[k]["raw"] and k not in prim and not any(k in r["out"] for r in recipes) and not items[k].get("synthetic"))
items = {k: v for k, v in items.items() if k in used or v["raw"] or k in cost_items}
for k in manual: items[k]["manual"] = True
# materiales de construcción cuya receta estándar es del Equipment Workshop (p. ej. el Taladro portátil de los Miner)
for k in cost_items & workshop_made: items[k]["workshop"] = True

# colores de materias primas (paleta propia, inspirada en el juego)
RAWCOL = {"Desc_OreIron_C": "#b9573f", "Desc_OreCopper_C": "#d9783a", "Desc_Stone_C": "#cbbfa7", "Desc_Coal_C": "#3d3d42",
          "Desc_OreGold_C": "#d8a630", "Desc_RawQuartz_C": "#e08fb8", "Desc_Sulfur_C": "#e2d34a", "Desc_OreBauxite_C": "#a8523a",
          "Desc_OreUranium_C": "#7fd14b", "Desc_SAM_C": "#8a4fd8", "Desc_Water_C": "#3b8fd9", "Desc_LiquidOil_C": "#2a2133",
          "Desc_NitrogenGas_C": "#a9b8c8"}
for k, v in RAWCOL.items():
    if k in items: items[k]["color"] = v

db = {"meta": {"game": "Satisfactory", "source": "CommunityResources/Docs (en-US, es-ES)", "generated": __import__("datetime").date.today().isoformat(),
               "docsMtime": os.path.getmtime(os.path.join(DOCS, "en-US.json")), "units": "por minuto; fluidos en m³/min"},
      "items": items, "recipes": recipes, "buildings": buildings, "extractors": extractors, "purity": purity,
      "belts": belts, "pipes": pipes, "world": world, "buildCosts": build_costs, "specials": specials, "progress": progress,
      "presets": {
        "Fase 5 del Space Elevator": ["Desc_SpaceElevatorPart_9_C", "Desc_SpaceElevatorPart_10_C", "Desc_SpaceElevatorPart_11_C", "Desc_SpaceElevatorPart_12_C"],
      }}
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
json.dump(db, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(items)} objetos · {len(recipes)} recetas ({sum(r['alt'] for r in recipes)} alternativas) · {len(manual)} manuales")
