// Race & Background Features and Class Features: features from the rules data and the player's own.
import { Notice } from "obsidian";
import * as E from "../../rules/engine";
import type { CharState } from "../../rules/engine";
import { button, iconButton, labeled, Picker, stepper } from "../widgets";
import { bulletList, richText } from "../richtext";
import type { CharacterSheet } from "../sheet";

/**
 * What a features section collects while listing its data features: the featureKey() of each one
 * the character has (shown, hidden or removed) and the hidden ones with the name shown to restore them.
 */
type FeatureCtx = { own: Set<string>; hidden: { key: string; name: string }[] };

// Manual mode: the features are a list the player types
export function manualRaceFeatures(sheet: CharacterSheet, root: HTMLElement) {
  sheet.section(root, "race-features", "Race & Background Features", (el) => bulletList(sheet, el, "race-features", (x) => x.manual.raceFeatures, "Feature or trait…", "+ Add feature"));
}
export function manualClassFeatures(sheet: CharacterSheet, root: HTMLElement) {
  sheet.section(root, "class-features", "Class Features", (el) => bulletList(sheet, el, "class-features", (x) => x.manual.classFeatures, "Feature (e.g. **Second Wind** — 1d10 + level, short rest)…", "+ Add feature"));
}

export function raceFeatures(sheet: CharacterSheet, root: HTMLElement) {
  const s = sheet.v, r = sheet.r;
  const race = r.race(s), sub = r.subrace(s), bg = r.background(s);
  sheet.section(root, "race-features", "Race & Background Features", (el) => {
    const ctx: FeatureCtx = { own: new Set(), hidden: [] };
    if (!race && !bg) el.createDiv({ cls: "dnd-hint", text: "Choose a race and a background to see their features." });
    if (race) {
      const h = el.createDiv({ cls: "dnd-subtitle" }); sheet.link(h, sub ? `${race.name} (${sub.name})` : race.name, sub?.link || race.link);
      const traits = [...race.traits.map((t) => ({ t, owner: race.id })), ...(sub?.traits || []).map((t) => ({ t, owner: sub!.id }))];
      for (const { t, owner } of traits.filter(({ t }) => !E.RACE_TRAIT_SKIP.has(t.name))) dataFeature(sheet, el, E.featureKey(owner, t.name), t.name, (sm) => sm.createSpan({ text: t.name, cls: "dnd-feature-name" }), t.text, ctx);
    }
    if (bg) {
      const h = el.createDiv({ cls: "dnd-subtitle" }); sheet.link(h, `Background: ${bg.name}`, bg.link);
      if (bg.feature) dataFeature(sheet, el, E.featureKey(bg.id, bg.feature.name), bg.feature.name, (sm) => sheet.link(sm, bg.feature!.name, bg.feature!.link || bg.link, "dnd-feature-name"), bg.feature.text || "*See the background note.*", ctx);
    }
    customFeatures(sheet, el, "race", ctx);
  });
}

export function classFeaturesSection(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v;
  sheet.section(root, "class-features", "Class Features", (el) => {
    const groups = d.features;
    const ctx: FeatureCtx = { own: new Set(), hidden: [] };
    if (!groups.length) el.createDiv({ cls: "dnd-hint", text: "Choose a class to see its features." });
    const res = d.resources;
    if (res.length) {
      const rr = el.createDiv({ cls: "dnd-resources" });
      for (const x of res) {
        const box = rr.createDiv({ cls: "dnd-resource" });
        box.createDiv({ cls: "dnd-label", text: x.label });
        const max = typeof x.max === "number" ? x.max : parseInt(String(x.max));
        if (Number.isFinite(max) && String(x.max) === String(max) && max > 0 && max <= 30) {
          const left = max - (s.resources[x.key] || 0);
          stepper(box, left, (v) => sheet.change((st) => { st.resources[x.key] = max - Math.max(0, Math.min(max, v)); }), { min: 0, max });
          box.createDiv({ cls: "dnd-breakdown", text: `of ${max}` });
        } else {
          const t = String(x.max);
          if (/^\d*d\d+/.test(t)) sheet.rollable(box, t, t, x.label, "dnd-stat-value"); else box.createDiv({ cls: "dnd-stat-value", text: t });
        }
      }
    }
    for (const g of groups) {
      const h = el.createDiv({ cls: "dnd-subtitle" });
      sheet.link(h, `${g.cls.name} ${g.level}`, g.cls.link);
      if (g.sub) { h.createSpan({ text: " · " }); sheet.link(h, g.sub.name, g.sub.link); }
      for (const f of g.features) {
        dataFeature(sheet, el, E.featureKey(g.sub?.features.includes(f) ? g.sub.id : g.cls.id, f.name, f.level), `${f.name} (Lv ${f.level})`, (sm) => {
          sm.createSpan({ cls: "dnd-feature-level", text: `Lv ${f.level}` });
          sheet.link(sm, f.name, f.link, "dnd-feature-name");
          if (f.optional) sm.createSpan({ cls: "dnd-tag", text: "optional (TCE)" });
        }, f.text, ctx);
      }
    }
    customFeatures(sheet, el, "class", ctx);
  });
}

/**
 * A feature from the rules data, with buttons to hide it (listed under the section, a click shows
 * it again) or remove it (gone from the sheet until it is picked again in "+ Add feature").
 */
export function dataFeature(sheet: CharacterSheet, el: HTMLElement, key: string, name: string, summary: (el: HTMLElement) => void, text: string, ctx: FeatureCtx) {
  ctx.own.add(key);
  if (sheet.s.removedFeatures.includes(key)) return;
  if (sheet.s.hiddenFeatures.includes(key)) { ctx.hidden.push({ key, name }); return; }
  featureButtons(sheet, sheet.details(el, summary, text, key), key, () => {
    new Notice(`Removed ${name}. To get it back, pick it in "+ Add feature".`);
    sheet.change((x) => { x.removedFeatures.push(key); });
  });
}

/** Hide (by `hideKey`, listed under the section) and remove buttons, together at the end of the feature's summary. */
export function featureButtons(sheet: CharacterSheet, d: HTMLElement, hideKey: string, remove: () => void) {
  const btns = d.querySelector("summary")!.createSpan({ cls: "dnd-feature-btns" });
  iconButton(btns, "eye-off", "Hide this feature", () => sheet.change((x) => { x.hiddenFeatures.push(hideKey); }), "dnd-feature-btn");
  iconButton(btns, "trash-2", "Remove this feature", remove, "dnd-feature-btn");
}

/**
 * The features the player added: from the rules data (shown from the data, with notes) or custom
 * (editable name, level and text). Then the hidden data features to show again, "+ Add feature"
 * (a list of the data's features) and "+ Custom feature". A custom feature just added opens with
 * its name being edited.
 */
export function customFeatures(sheet: CharacterSheet, el: HTMLElement, kind: E.CustomFeature["kind"], ctx: FeatureCtx) {
  const edit = (x: CharState, id: string, set: (f: E.CustomFeature) => void) => { const f = x.customFeatures.find((y) => y.id === id); if (f) set(f); };
  const remove = (id: string) => sheet.change((x) => { x.customFeatures = x.customFeatures.filter((y) => y.id !== id); });
  const index = E.featureIndex(sheet.r, kind);
  for (const f of E.customFeatures(sheet.s, kind)) {
    // already listed above when the character's class, race or background now gives it
    if (f.ref && ctx.own.has(f.ref)) continue;
    // the data's text and link while the feature is in the data, else the copy saved with it
    const data = f.ref ? index.find((x) => x.key === f.ref) : undefined;
    const hideKey = f.ref ?? `custom#${f.id}`;
    if (sheet.s.hiddenFeatures.includes(hideKey)) { ctx.hidden.push({ key: hideKey, name: data?.name ?? (f.name || "New feature") }); continue; }
    if (f.ref) {
      featureButtons(sheet, sheet.details(el, (sm) => {
        if (kind === "class") sm.createSpan({ cls: "dnd-feature-level", text: `Lv ${data?.level ?? f.level}` });
        sheet.link(sm, data?.name ?? f.name, data?.link, "dnd-feature-name");
        sm.createSpan({ cls: "dnd-tag", text: data?.from ?? "added" });
      }, data?.text ?? f.text, f.ref), hideKey, () => remove(f.id));
      continue;
    }
    const autoEdit = sheet.focusItem === `feature:${f.id}`;
    if (autoEdit) sheet.focusItem = null;
    const d = el.createEl("details", { cls: "dnd-details dnd-custom-feature" });
    d.open = autoEdit;
    const sm = d.createEl("summary");
    const lvl = kind === "class" ? sm.createSpan({ cls: "dnd-feature-level", text: `Lv ${f.level}` }) : null;
    const nameEl = sm.createSpan({ cls: "dnd-feature-name", text: f.name || "New feature" });
    sm.createSpan({ cls: "dnd-tag", text: "custom" });
    featureButtons(sheet, d, hideKey, () => remove(f.id));
    const body = d.createDiv({ cls: "dnd-custom-feature-body" });
    const row = body.createDiv({ cls: "dnd-row dnd-fill" });
    // saved without a re-render so the feature stays open; the summary is updated in place
    richText(sheet, labeled(row, "Name"), f.name, (v) => { nameEl.setText(v || "New feature"); sheet.change((x) => edit(x, f.id, (y) => { y.name = v; }), false); }, { placeholder: "Feature name", singleLine: true, autoEdit });
    if (lvl) stepper(labeled(row, "Level", "dnd-field-narrow"), f.level, (v) => { lvl.setText(`Lv ${v}`); sheet.change((x) => edit(x, f.id, (y) => { y.level = v; }), false); }, { min: 1, max: 20 });
    richText(sheet, labeled(body, "Text", "dnd-rich-field"), f.text, (v) => sheet.change((x) => edit(x, f.id, (y) => { y.text = v; }), false), { placeholder: "What it does: uses, range, rulings… Type [[ to link a note." });
  }
  if (ctx.hidden.length) {
    const row = el.createDiv({ cls: "dnd-hidden-features" });
    row.createSpan({ cls: "dnd-label", text: "Hidden" });
    for (const h of ctx.hidden) {
      const chip = row.createSpan({ cls: "dnd-chip", text: h.name, attr: { "aria-label": "Show this feature again" } });
      chip.onclick = () => sheet.change((x) => { x.hiddenFeatures = x.hiddenFeatures.filter((k) => k !== h.key); });
    }
  }
  const add = el.createDiv({ cls: "dnd-row" });
  // everything not on the sheet: a feature the character has but hid or removed is shown again
  const shown = (k: string) => ctx.own.has(k) && !sheet.s.hiddenFeatures.includes(k) && !sheet.s.removedFeatures.includes(k);
  const added = new Set(sheet.s.customFeatures.map((f) => f.ref).filter(Boolean));
  const items = index.filter((f) => !shown(f.key) && !added.has(f.key));
  if (items.length) button(add, "+ Add feature", () => new Picker(sheet.app, items, (f) => `${f.name} (${f.from}${f.level != null ? `, level ${f.level}` : ""})`, (f) => sheet.change((x) => {
    if (ctx.own.has(f.key)) { x.hiddenFeatures = x.hiddenFeatures.filter((k) => k !== f.key); x.removedFeatures = x.removedFeatures.filter((k) => k !== f.key); }
    else x.customFeatures.push(E.addedFeature(kind, f));
  }), kind === "class" ? "Search class and subclass features…" : "Search race traits and background features…", (f) => sheet.sourceName(f.source)).open(), "dnd-small");
  button(add, "+ Custom feature", () => {
    const f = E.newCustomFeature(kind, E.totalLevel(sheet.v) || 1);
    sheet.focusItem = `feature:${f.id}`;
    sheet.change((x) => { x.customFeatures.push(f); });
  }, "dnd-small");
}
