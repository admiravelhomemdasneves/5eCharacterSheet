// The sheet's header: portrait, name, race, background and classes (or what manual mode types in).
import { TFile } from "obsidian";
import * as E from "../../rules/engine";
import { fmtMod } from "../../rules/engine";
import { button, iconButton, imageFiles, labeled, Picker, select, stepper, textInput } from "../widgets";
import { richText } from "../richtext";
import type { CharacterSheet } from "../sheet";

export function header(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v, r = sheet.r, sc = d.scores;
  const head = root.createDiv({ cls: "dnd-header" });
  // the remove button sits outside the round portrait so the circle does not clip it
  const pwrap = head.createDiv({ cls: "dnd-portrait-wrap" });
  const img = pwrap.createDiv({ cls: "dnd-portrait", attr: { "aria-label": "Click to choose an image" } });
  const file = s.image ? sheet.app.vault.getAbstractFileByPath(s.image) : null;
  if (file instanceof TFile) img.createEl("img", { attr: { src: sheet.app.vault.getResourcePath(file) } });
  else img.createDiv({ cls: "dnd-portrait-empty", text: "＋ Image" });
  const removeImage = () => sheet.change((x) => { x.image = ""; });
  img.onclick = () => {
    // "No image" comes first in the list when there is an image to remove
    const items: (TFile | null)[] = s.image ? [null, ...imageFiles(sheet.app)] : imageFiles(sheet.app);
    new Picker<TFile | null>(sheet.app, items, (f) => (f ? f.path : "— No image —"), (f) => (f ? sheet.change((x) => { x.image = f.path; }) : removeImage()), "Choose a portrait image…").open();
  };
  if (s.image) iconButton(pwrap, "x", "Remove image", removeImage, "dnd-portrait-remove");

  const info = head.createDiv({ cls: "dnd-header-info" });
  textInput(info, s.name, (v) => sheet.change((x) => { x.name = v; }), "Character name", "dnd-name");
  const row1 = info.createDiv({ cls: "dnd-row dnd-fill" });
  textInput(labeled(row1, "Player"), s.player, (v) => sheet.change((x) => { x.player = v; }), "Player name");
  select(labeled(row1, "Alignment"), E.ALIGNMENTS.map((a) => ({ value: a, label: a })), s.alignment, (v) => sheet.change((x) => { x.alignment = v; }));
  const lvl = d.level;
  if (sheet.manual) { manualHeader(sheet, info, d); return; }

  const row2 = info.createDiv({ cls: "dnd-row dnd-fill" });
  const raceEl = labeled(row2, "Race");
  sheet.pick(raceEl, r.data.races.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, group: sheet.sourceName(x.source), link: x.link })), s.race,
    (v) => sheet.change((x) => { x.race = v || null; x.subrace = null; x.raceAbility = { option: 0, picks: [] }; x.raceSkills = []; }), "Choose race…");
  const race = r.race(s);
  if (race) sheet.link(raceEl, "📖", race.link, "dnd-book");
  if (race?.subraces.length) {
    const subEl = labeled(row2, "Subrace");
    sheet.pick(subEl, race.subraces.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, link: x.link })), s.subrace, (v) => sheet.change((x) => { x.subrace = v || null; x.raceAbility = { option: 0, picks: [] }; }), race.subraceRequired ? "Choose subrace…" : "None");
    const sub = r.subrace(s);
    if (sub) sheet.link(subEl, "📖", sub.link, "dnd-book");
  }
  const bgEl = labeled(row2, "Background");
  sheet.pick(bgEl, r.data.backgrounds.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, group: sheet.sourceName(x.source), link: x.link })), s.background, (v) => sheet.change((x) => { x.background = v || null; }), "Choose background…");
  const bg = r.background(s);
  if (bg) sheet.link(bgEl, "📖", bg.link, "dnd-book");

  // summary sits between race/background and the classes
  const sumRow = info.createDiv({ cls: "dnd-summary" });
  sumRow.createSpan({ text: `Level ${lvl || "—"}` });
  sumRow.createSpan({ text: `Proficiency Bonus ${fmtMod(d.pb)}` });
  const sizes = race?.size.join("/") || "";
  if (sizes) sumRow.createSpan({ text: sizes });

  // classes (multiclass)
  const classes = info.createDiv({ cls: "dnd-classes" });
  s.classes.forEach((e, i) => {
    const row = classes.createDiv({ cls: "dnd-row dnd-fill dnd-class-row" });
    const c = r.cls(e.id);
    stepper(labeled(row, "Level", "dnd-field-narrow"), e.level, (v) => sheet.change((st) => { st.classes[i].level = v; }), { min: 1, max: 20 });
    const cEl = labeled(row, i === 0 ? "Class" : "Multiclass");
    sheet.pick(cEl, r.data.classes.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, link: x.link })), e.id, (v) => { if (v) sheet.change((st) => { st.classes[i] = { id: v, subclass: null, level: e.level, hpRolls: [], skills: [] }; }); }, "Choose class…");
    if (c) sheet.link(cEl, "📖", c.link, "dnd-book");
    if (c?.subclasses.length) {
      const scEl = labeled(row, c.subclassTitle);
      const locked = e.level < c.subclassLevel && !e.subclass;
      sheet.pick(scEl, c.subclasses.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, group: sheet.sourceName(x.source), link: x.link })), e.subclass, (v) => sheet.change((st) => { st.classes[i].subclass = v || null; }), locked ? `at level ${c.subclassLevel}` : "Choose…", locked);
      const sub = r.subclass(e);
      if (sub) sheet.link(scEl, "📖", sub.link, "dnd-book");
    }
    if (s.classes.length > 1 || !c) iconButton(row, "trash-2", "Remove class", () => sheet.change((st) => { st.classes.splice(i, 1); }));
  });
  const add = classes.createDiv({ cls: "dnd-row dnd-add-row" });
  const addOpts = r.data.classes.filter((c) => !s.classes.some((e) => e.id === c.id)).map((c) => {
    const req = s.classes.length ? E.multiclassRequirementsMet(r, c, sc) : { ok: true, text: "" };
    return { value: c.id, label: `${c.name} (${c.source})${req.ok ? "" : ` — needs ${req.text}`}`, link: c.link };
  });
  sheet.pick(add, addOpts, "", (v) => { if (v) sheet.change((st) => { st.classes.push({ id: v, subclass: null, level: 1, hpRolls: [], skills: [] }); }); }, s.classes.length ? "+ Add class (multiclass)…" : "Choose class…", false, "dnd-add-class");
  if (s.classes.length > 1) {
    const unmet = s.classes.flatMap((e) => { const c = r.cls(e.id), req = c && E.multiclassRequirementsMet(r, c, sc); return c && req && !req.ok ? [`${c.name} (${req.text})`] : []; });
    if (unmet.length) add.createDiv({ cls: "dnd-warn", text: `Multiclass requirements not met: ${unmet.join(", ")}` });
  }
}

// Manual mode: race, background and classes are typed in (no rules data)
export function manualHeader(sheet: CharacterSheet, info: HTMLElement, d: E.Derived) {
  const lvl = d.level;
  const m = sheet.s.manual;
  const row2 = info.createDiv({ cls: "dnd-row dnd-fill" });
  for (const [k, label] of [["race", "Race"], ["subrace", "Subrace"], ["background", "Background"]] as const) {
    richText(sheet, labeled(row2, label), m[k], (v) => sheet.change((x) => { x.manual[k] = v; }, false), { placeholder: "—", singleLine: true });
  }
  const sumRow = info.createDiv({ cls: "dnd-summary" });
  sumRow.createSpan({ text: `Level ${lvl || "—"}` });
  sumRow.createSpan({ text: `Proficiency Bonus ${fmtMod(d.pb)}` });
  const classes = info.createDiv({ cls: "dnd-classes" });
  m.classes.forEach((c, i) => {
    const row = classes.createDiv({ cls: "dnd-row dnd-fill dnd-class-row" });
    stepper(labeled(row, "Level", "dnd-field-narrow"), c.level, (v) => sheet.change((x) => { x.manual.classes[i].level = v; }), { min: 1, max: 20 });
    richText(sheet, labeled(row, i === 0 ? "Class" : "Multiclass"), c.name, (v) => sheet.change((x) => { x.manual.classes[i].name = v; }), { placeholder: "Class", singleLine: true });
    richText(sheet, labeled(row, "Subclass"), c.subclass, (v) => sheet.change((x) => { x.manual.classes[i].subclass = v; }), { placeholder: "—", singleLine: true });
    iconButton(row, "trash-2", "Remove class", () => sheet.change((x) => { x.manual.classes.splice(i, 1); }));
  });
  const add = classes.createDiv({ cls: "dnd-row dnd-add-row" });
  button(add, m.classes.length ? "+ Add class (multiclass)" : "+ Add class", () => sheet.change((x) => { x.manual.classes.push({ name: "", subclass: "", level: 1 }); }));
}
