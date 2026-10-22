import { Component, MarkdownRenderChild, MarkdownRenderer, Menu, Notice, TFile } from "obsidian";
import type CharacterSheetPlugin from "../main";
import * as E from "../rules/engine";
import { ABILITIES, ABILITY_NAMES, Ability, CharState, fmtMod, mod } from "../rules/engine";
import { button, checkbox, iconButton, imageFiles, labeled, Picker, RichOpt, richSelect, select, stepper, textInput } from "./widgets";
import { d20, roll } from "./dice";
import { isD20, withAdvantage } from "../rules/roll";
import { SECTIONS } from "../sections";

const ORD = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/**
 * What a features section collects while listing its data features: the featureKey() of each one
 * the character has (shown, hidden or removed) and the hidden ones with the name shown to restore them.
 */
type FeatureCtx = { own: Set<string>; hidden: { key: string; name: string }[] };

export class CharacterSheet extends MarkdownRenderChild {
  private s!: CharState;
  /** what the rules engine reads: the state itself, or its manual-mode view */
  private v!: CharState;
  private saveTimer: number | null = null;
  /** owns what one render() makes (markdown children); unloaded by the next render */
  private renderScope: Component | null = null;

  constructor(private plugin: CharacterSheetPlugin, el: HTMLElement, private sourcePath: string) {
    super(el);
  }
  private get r() { return this.plugin.rules; }
  private get manual() { return this.plugin.manual; }
  /** called by the plugin when settings or rules data change */
  reload() { this.render(); }

  onload() {
    this.plugin.sheets.add(this);
    const file = this.file();
    const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
    // in-memory copy wins over the metadata cache, which lags behind our own writes
    this.s = E.normalize(this.plugin.states.get(this.sourcePath) ?? (fm?.dnd as Partial<CharState> | undefined) ?? this.plugin.freshCharacter(file?.basename ?? ""));
    if (!this.s.name && file) this.s.name = file.basename;
    this.render();
    if (file) void this.migrateBody(file);
  }
  // Move the old "## Biography" / "## Notes" note sections into the Biography & Diary box (once)
  private async migrateBody(file: TFile) {
    const legacy = E.extractLegacySections(await this.app.vault.read(file));
    if (!legacy) return;
    this.change((x) => {
      if (legacy.biography) x.biography = x.biography ? `${x.biography}\n\n${legacy.biography}` : legacy.biography;
      if (legacy.diary) x.diary = x.diary ? `${x.diary}\n\n${legacy.diary}` : legacy.diary;
    });
    await this.app.vault.process(file, (text) => E.extractLegacySections(text)?.text ?? text);
  }
  onunload() { this.plugin.sheets.delete(this); if (this.saveTimer) { window.clearTimeout(this.saveTimer); void this.flush(); } }

  private get app() { return this.plugin.app; }
  private file() { const f = this.app.vault.getAbstractFileByPath(this.sourcePath); return f instanceof TFile ? f : null; }

  // ---------------------------------------------------------------- persistence
  private change(mutate: (s: CharState) => void, rerender = true) {
    mutate(this.s);
    // a lower maximum (level down, CON down, manual edit) must not leave current HP above it
    if (this.s.hp.current != null) {
      const view = this.manual ? E.manualView(this.s) : this.s;
      const max = this.manual ? this.s.manual.maxHp : E.hpBreakdown(this.r, view).max;
      this.s.hp.current = E.currentHp(this.s, max);
    }
    this.plugin.states.set(this.sourcePath, this.s);
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { void this.flush(); }, 500);
    if (rerender) this.render();
  }
  private async flush() {
    this.saveTimer = null;
    const file = this.file();
    if (!file) return;
    const s0 = this.s, r = this.r, man = this.manual;
    const s = man ? E.manualView(s0) : s0;
    const sc = E.abilityScores(r, s);
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm.dnd = JSON.parse(JSON.stringify(s0)) as CharState;
      // flat keys for Dataview, Initiative Tracker (players) and Fantasy Statblocks
      fm.name = s.name || file.basename;
      fm.player = s.player || undefined;
      fm.race = (man ? [s0.manual.race, s0.manual.subrace] : [r.race(s)?.name, r.subrace(s)?.name]).filter(Boolean).join(" ") || undefined;
      fm.class = (man ? s0.manual.classes.map((c) => `${c.name || "?"} ${c.level}`) : s.classes.map((e) => `${r.cls(e.id)?.name ?? "?"} ${e.level}`)).join(" / ") || undefined;
      fm.level = E.totalLevel(s);
      fm.hp = man ? s0.manual.maxHp : E.hpBreakdown(r, s, sc).max;
      fm.ac = man ? s0.manual.ac : E.armorClass(r, s, sc).value;
      fm.modifier = E.initiative(r, s, sc);
      fm.stats = ABILITIES.map((a) => sc[a].total);
      if (s0.image) fm.image = s0.image; else delete fm.image;
      for (const k of Object.keys(fm)) if (fm[k] === undefined) delete fm[k];
    });
  }

  // ---------------------------------------------------------------- rendering
  // Theme from the settings. The custom colour is an inline style, which empty() keeps, so it is
  // set or cleared ("" removes the property) on every render.
  private applyTheme(root: HTMLElement) {
    const st = this.plugin.settings;
    root.toggleClass("dnd-theme-obsidian", st.theme === "obsidian");
    root.setCssProps({ "--dnd-accent": st.theme === "custom" ? st.customAccent : "" });
  }
  render() {
    const root = this.containerEl;
    root.empty();
    if (this.renderScope) this.removeChild(this.renderScope);
    this.renderScope = this.addChild(new Component());
    root.addClass("dnd-sheet");
    this.applyTheme(root);
    this.v = this.manual ? E.manualView(this.s) : this.s;
    const s = this.v, r = this.r;
    const sc = E.abilityScores(r, s);
    this.hiddenSectionsMenu(root);
    this.header(root, sc);
    const pending = this.manual ? [] : E.pendingChoices(r, s);
    if (pending.length) this.section(root, "creation", `Character Creation — ${pending.length} pending`, (el) => {
      const ul = el.createEl("ul", { cls: "dnd-pending" });
      pending.forEach((p) => ul.createEl("li", { text: p }));
    });
    this.abilities(root, sc);
    // Combat and Skills share a row; a hidden one leaves no empty column (see .dnd-combat-row)
    const grid = root.createDiv({ cls: "dnd-grid-2 dnd-combat-row" });
    if (!this.isHidden("combat")) this.combat(grid.createDiv(), sc);
    if (!this.isHidden("skills")) this.skills(grid.createDiv(), sc);
    if (!grid.childElementCount) grid.remove();
    this.attacks(root, sc);
    this.raceFeatures(root);
    this.classFeaturesSection(root);
    this.feats(root);
    this.spellcasting(root, sc);
    this.inventory(root, sc);
    this.proficiencies(root);
    this.personality(root);
    this.biography(root);
  }

  private section(parent: HTMLElement, key: string, label: string, build: (el: HTMLElement) => void, actions?: (el: HTMLElement) => void) {
    if (this.isHidden(key)) return;
    const sec = parent.createDiv({ cls: "dnd-section" });
    const head = sec.createDiv({ cls: "dnd-section-head" });
    const collapsed = !!this.s.ui.collapsed[key];
    const tog = head.createSpan({ cls: "dnd-collapse", text: collapsed ? "▸" : "▾" });
    head.createEl("h3", { text: label });
    // hide button, shown while the title row is hovered (see .dnd-section-hide)
    if (SECTIONS.some((x) => x.key === key)) iconButton(head, "eye-off", "Hide this section", () => this.change((x) => { x.ui.hidden[key] = true; }), "dnd-section-hide");
    if (actions) actions(head.createDiv({ cls: "dnd-section-actions" }));
    const body = sec.createDiv({ cls: "dnd-section-body" });
    const toggle = () => this.change((s) => { s.ui.collapsed[key] = !collapsed; });
    tog.onclick = toggle; head.querySelector("h3")!.addEventListener("click", toggle);
    if (!collapsed) build(body);
  }

  private link(parent: HTMLElement, text: string, target: string | null | undefined, cls = "") {
    if (!target) return parent.createSpan({ text, cls });
    const a = parent.createEl("a", { text, cls: `internal-link ${cls}`, href: target, attr: { "data-href": target } });
    a.addEventListener("click", (e) => { e.preventDefault(); void this.app.workspace.openLinkText(target, this.sourcePath, e.ctrlKey || e.metaKey); });
    a.addEventListener("mouseover", (e) => this.app.workspace.trigger("hover-link", { event: e, source: "preview", hoverParent: this, targetEl: a, linktext: target, sourcePath: this.sourcePath }));
    return a;
  }
  private md(parent: HTMLElement, text: string) {
    const el = parent.createDiv({ cls: "dnd-md" });
    void MarkdownRenderer.render(this.app, this.plugin.linker.text(text), el, this.sourcePath, this.renderScope ?? this);
    return el;
  }
  private rollable(parent: HTMLElement, text: string, formula: string, label: string, cls = "") {
    const tip = isD20(formula) ? `Roll ${formula} · Shift: advantage · Ctrl: disadvantage` : `Roll ${formula}`;
    const b = parent.createSpan({ text, cls: `dnd-roll ${cls}`, attr: { "aria-label": tip } });
    b.onclick = (e) => {
      e.stopPropagation();
      // Shift = advantage, Ctrl/Cmd = disadvantage (d20 rolls only)
      const mode = !isD20(formula) ? "normal" : e.shiftKey ? "adv" : e.ctrlKey || e.metaKey ? "dis" : "normal";
      void roll(this.app, withAdvantage(formula, mode), label + (mode === "adv" ? " (advantage)" : mode === "dis" ? " (disadvantage)" : ""));
    };
    return b;
  }
  /** `noteKey`: the feature's E.featureKey(); adds the player's notes field under the text */
  private details(parent: HTMLElement, summary: (el: HTMLElement) => void, text: string, noteKey?: string) {
    const d = parent.createEl("details", { cls: "dnd-details" });
    const sm = d.createEl("summary");
    summary(sm);
    // shows, while closed, that the feature has notes; kept in step as they are edited
    const tag = noteKey ? sm.createSpan({ cls: "dnd-tag", text: "notes" }) : null;
    tag?.toggle(!!this.s.featureNotes[noteKey!]);
    let done = false;
    d.addEventListener("toggle", () => {
      if (!d.open || done) return;
      done = true;
      this.md(d, text);
      if (noteKey) this.richText(labeled(d, "Notes", "dnd-feature-notes"), this.s.featureNotes[noteKey] ?? "", (v) => {
        tag?.toggle(!!v.trim());
        this.change((x) => { if (v.trim()) x.featureNotes[noteKey] = v; else delete x.featureNotes[noteKey]; }, false);
      }, { placeholder: "Your notes: reminders, uses, rulings… Type [[ to link a note." });
    });
    return d;
  }

  // ---------------------------------------------------------------- header
  private header(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    const s = this.v, r = this.r;
    const head = root.createDiv({ cls: "dnd-header" });
    // the remove button sits outside the round portrait so the circle does not clip it
    const pwrap = head.createDiv({ cls: "dnd-portrait-wrap" });
    const img = pwrap.createDiv({ cls: "dnd-portrait", attr: { "aria-label": "Click to choose an image" } });
    const file = s.image ? this.app.vault.getAbstractFileByPath(s.image) : null;
    if (file instanceof TFile) img.createEl("img", { attr: { src: this.app.vault.getResourcePath(file) } });
    else img.createDiv({ cls: "dnd-portrait-empty", text: "＋ Image" });
    const removeImage = () => this.change((x) => { x.image = ""; });
    img.onclick = () => {
      // "No image" comes first in the list when there is an image to remove
      const items: (TFile | null)[] = s.image ? [null, ...imageFiles(this.app)] : imageFiles(this.app);
      new Picker<TFile | null>(this.app, items, (f) => (f ? f.path : "— No image —"), (f) => (f ? this.change((x) => { x.image = f.path; }) : removeImage()), "Choose a portrait image…").open();
    };
    if (s.image) iconButton(pwrap, "x", "Remove image", removeImage, "dnd-portrait-remove");

    const info = head.createDiv({ cls: "dnd-header-info" });
    textInput(info, s.name, (v) => this.change((x) => { x.name = v; }), "Character name", "dnd-name");
    const row1 = info.createDiv({ cls: "dnd-row dnd-fill" });
    textInput(labeled(row1, "Player"), s.player, (v) => this.change((x) => { x.player = v; }), "Player name");
    select(labeled(row1, "Alignment"), E.ALIGNMENTS.map((a) => ({ value: a, label: a })), s.alignment, (v) => this.change((x) => { x.alignment = v; }));
    const lvl = E.totalLevel(s);
    if (this.manual) { this.manualHeader(info, lvl); return; }

    const row2 = info.createDiv({ cls: "dnd-row dnd-fill" });
    const raceEl = labeled(row2, "Race");
    this.pick(raceEl, r.data.races.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, group: this.sourceName(x.source), link: x.link })), s.race,
      (v) => this.change((x) => { x.race = v || null; x.subrace = null; x.raceAbility = { option: 0, picks: [] }; x.raceSkills = []; }), "Choose race…");
    const race = r.race(s);
    if (race) this.link(raceEl, "📖", race.link, "dnd-book");
    if (race?.subraces.length) {
      const subEl = labeled(row2, "Subrace");
      this.pick(subEl, race.subraces.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, link: x.link })), s.subrace, (v) => this.change((x) => { x.subrace = v || null; x.raceAbility = { option: 0, picks: [] }; }), race.subraceRequired ? "Choose subrace…" : "None");
      const sub = r.subrace(s);
      if (sub) this.link(subEl, "📖", sub.link, "dnd-book");
    }
    const bgEl = labeled(row2, "Background");
    this.pick(bgEl, r.data.backgrounds.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, group: this.sourceName(x.source), link: x.link })), s.background, (v) => this.change((x) => { x.background = v || null; }), "Choose background…");
    const bg = r.background(s);
    if (bg) this.link(bgEl, "📖", bg.link, "dnd-book");

    // summary sits between race/background and the classes
    const sumRow = info.createDiv({ cls: "dnd-summary" });
    sumRow.createSpan({ text: `Level ${lvl || "—"}` });
    sumRow.createSpan({ text: `Proficiency Bonus ${fmtMod(E.proficiencyBonus(lvl))}` });
    const sizes = race?.size.join("/") || "";
    if (sizes) sumRow.createSpan({ text: sizes });

    // classes (multiclass)
    const classes = info.createDiv({ cls: "dnd-classes" });
    s.classes.forEach((e, i) => {
      const row = classes.createDiv({ cls: "dnd-row dnd-fill dnd-class-row" });
      const c = r.cls(e.id);
      stepper(labeled(row, "Level", "dnd-field-narrow"), e.level, (v) => this.change((st) => { st.classes[i].level = v; }), { min: 1, max: 20 });
      const cEl = labeled(row, i === 0 ? "Class" : "Multiclass");
      this.pick(cEl, r.data.classes.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, link: x.link })), e.id, (v) => { if (v) this.change((st) => { st.classes[i] = { id: v, subclass: null, level: e.level, hpRolls: [], skills: [] }; }); }, "Choose class…");
      if (c) this.link(cEl, "📖", c.link, "dnd-book");
      if (c?.subclasses.length) {
        const scEl = labeled(row, c.subclassTitle);
        const locked = e.level < c.subclassLevel && !e.subclass;
        this.pick(scEl, c.subclasses.map((x) => ({ value: x.id, label: `${x.name} (${x.source})`, group: this.sourceName(x.source), link: x.link })), e.subclass, (v) => this.change((st) => { st.classes[i].subclass = v || null; }), locked ? `at level ${c.subclassLevel}` : "Choose…", locked);
        const sub = r.subclass(e);
        if (sub) this.link(scEl, "📖", sub.link, "dnd-book");
      }
      if (s.classes.length > 1 || !c) iconButton(row, "trash-2", "Remove class", () => this.change((st) => { st.classes.splice(i, 1); }));
    });
    const add = classes.createDiv({ cls: "dnd-row dnd-add-row" });
    const addOpts = r.data.classes.filter((c) => !s.classes.some((e) => e.id === c.id)).map((c) => {
      const req = s.classes.length ? E.multiclassRequirementsMet(r, c, sc) : { ok: true, text: "" };
      return { value: c.id, label: `${c.name} (${c.source})${req.ok ? "" : ` — needs ${req.text}`}`, link: c.link };
    });
    this.pick(add, addOpts, "", (v) => { if (v) this.change((st) => { st.classes.push({ id: v, subclass: null, level: 1, hpRolls: [], skills: [] }); }); }, s.classes.length ? "+ Add class (multiclass)…" : "Choose class…", false, "dnd-add-class");
    if (s.classes.length > 1) {
      const bad = s.classes.map((e) => r.cls(e.id)).filter((c) => c && !E.multiclassRequirementsMet(r, c, sc).ok);
      if (bad.length) add.createDiv({ cls: "dnd-warn", text: `Multiclass requirements not met: ${bad.map((c) => `${c!.name} (${E.multiclassRequirementsMet(r, c!, sc).text})`).join(", ")}` });
    }
  }
  // Manual mode: race, background and classes are typed in (no rules data)
  private manualHeader(info: HTMLElement, lvl: number) {
    const m = this.s.manual;
    const row2 = info.createDiv({ cls: "dnd-row dnd-fill" });
    for (const [k, label] of [["race", "Race"], ["subrace", "Subrace"], ["background", "Background"]] as const) {
      this.richText(labeled(row2, label), m[k], (v) => this.change((x) => { x.manual[k] = v; }, false), { placeholder: "—", singleLine: true });
    }
    const sumRow = info.createDiv({ cls: "dnd-summary" });
    sumRow.createSpan({ text: `Level ${lvl || "—"}` });
    sumRow.createSpan({ text: `Proficiency Bonus ${fmtMod(E.proficiencyBonus(lvl))}` });
    const classes = info.createDiv({ cls: "dnd-classes" });
    m.classes.forEach((c, i) => {
      const row = classes.createDiv({ cls: "dnd-row dnd-fill dnd-class-row" });
      stepper(labeled(row, "Level", "dnd-field-narrow"), c.level, (v) => this.change((x) => { x.manual.classes[i].level = v; }), { min: 1, max: 20 });
      this.richText(labeled(row, i === 0 ? "Class" : "Multiclass"), c.name, (v) => this.change((x) => { x.manual.classes[i].name = v; }), { placeholder: "Class", singleLine: true });
      this.richText(labeled(row, "Subclass"), c.subclass, (v) => this.change((x) => { x.manual.classes[i].subclass = v; }), { placeholder: "—", singleLine: true });
      iconButton(row, "trash-2", "Remove class", () => this.change((x) => { x.manual.classes.splice(i, 1); }));
    });
    const add = classes.createDiv({ cls: "dnd-row dnd-add-row" });
    button(add, m.classes.length ? "+ Add class (multiclass)" : "+ Add class", () => this.change((x) => { x.manual.classes.push({ name: "", subclass: "", level: 1 }); }));
  }

  // Searchable dropdown whose options show the compendium note preview on hover
  private pick(parent: HTMLElement, opts: RichOpt[], value: string | null, onChange: (v: string) => void, placeholder: string, disabled = false, cls = "") {
    return richSelect(parent, opts, value, onChange, {
      placeholder, disabled, cls,
      hover: (ev, target, link) => this.app.workspace.trigger("hover-link", { event: ev, source: "preview", hoverParent: this, targetEl: target, linktext: link, sourcePath: this.sourcePath }),
      // close any preview still open when the menu closes (e.g. after picking an option)
      onClose: () => (this as { hoverPopover?: { hide?: () => void } | null }).hoverPopover?.hide?.(),
    });
  }
  private sourceName(src: string) { return this.r.data.meta.sources[src] || src; }

  // ---------------------------------------------------------------- abilities & saves
  private abilities(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    const s = this.v, r = this.r;
    const editing = !!s.ui.editing.abilities;
    this.section(root, "abilities", "Ability Scores", (el) => {
      const boxes = el.createDiv({ cls: `dnd-abilities${editing ? " is-editing" : ""}` });
      for (const a of ABILITIES) {
        const b = sc[a];
        const box = boxes.createDiv({ cls: "dnd-ability" });
        box.createDiv({ cls: "dnd-ability-name", text: ABILITY_NAMES[a] });
        this.rollable(box, fmtMod(mod(b.total)), d20(mod(b.total)), `${ABILITY_NAMES[a]} check`, "dnd-ability-mod");
        if (!editing) { box.createDiv({ cls: "dnd-ability-score", text: String(b.total) }); continue; }
        const edit = box.createDiv({ cls: "dnd-ability-base" });
        // the standard array value is a pick; the editor below adds or removes Adjust on top of it
        if (s.abilities.method === "standard") {
          select(edit, E.STANDARD_ARRAY.map((v) => ({ value: String(v), label: String(v) })), String(s.abilities.base[a]), (v) => this.change((x) => { x.abilities.base[a] = parseInt(v) || 8; }), "—");
        }
        // one editor for the whole score: each step goes to base or Adjust (see E.stepAbility)
        stepper(edit, b.total, (v) => this.change((x) => {
          for (let n = v - b.total; n !== 0; n -= Math.sign(n)) E.stepAbility(x, a, n > 0 ? 1 : -1);
        }), { title: `${ABILITY_NAMES[a]} score` });
        const terms: [number, string][] = [[b.race, "race"], [b.asi, "ASI"], [b.feat, "feat"], [b.feature, "class"], [b.adjust, "adj."]];
        const formula = terms.filter(([n]) => n).map(([n, label]) => ` ${n > 0 ? "+" : "−"} ${Math.abs(n)} ${label}`).join("");
        box.createDiv({ cls: "dnd-breakdown", text: `${b.base} base${formula} · max ${b.max}` });
        if (b.over) box.createDiv({ cls: "dnd-warn", text: `Above the maximum of ${b.max}` });
      }
      if (editing) this.abilityEditor(el);

      // saving throws
      const saves = el.createDiv({ cls: "dnd-saves" });
      saves.createDiv({ cls: "dnd-subtitle", text: "Saving Throws" });
      const prof = E.saveProficiencies(r, s);
      const pb = E.proficiencyBonus(E.totalLevel(s));
      const row = saves.createDiv({ cls: "dnd-save-row" });
      for (const a of ABILITIES) {
        const cell = row.createDiv({ cls: "dnd-save" });
        checkbox(cell, prof[a] > 0, (v) => this.change((x) => { x.saves[a] = v ? 1 : 0; }), "Proficient");
        const bonus = mod(sc[a].total) + prof[a] * pb;
        cell.createSpan({ text: a.toUpperCase() + " " });
        this.rollable(cell, fmtMod(bonus), d20(bonus), `${ABILITY_NAMES[a]} save`);
      }
    }, (actions) => {
      iconButton(actions, editing ? "check" : "pencil", editing ? "Done editing" : "Edit ability scores", () => this.change((x) => { x.ui.editing.abilities = !editing; x.ui.collapsed.abilities = false; }), editing ? "is-active" : "");
    });
  }
  // Generation method, point buy and racial bonus choices: only shown in edit mode
  private abilityEditor(el: HTMLElement) {
    const s = this.v, r = this.r;
    {
      const ctl = el.createDiv({ cls: "dnd-row" });
      select(labeled(ctl, "Method"), [
        { value: "pointbuy", label: "Point Buy (27)" }, { value: "standard", label: "Standard Array" },
        { value: "roll", label: "Roll 4d6 (drop lowest)" }, { value: "manual", label: "Manual" },
      ], s.abilities.method, (v) => this.change((x) => {
        x.abilities.method = (v || "manual") as CharState["abilities"]["method"];
        if (v === "pointbuy") x.abilities.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
      }));
      if (s.abilities.method === "pointbuy") {
        const pb = E.pointBuySpent(s.abilities.base);
        ctl.createDiv({ cls: pb.valid ? "dnd-hint" : "dnd-warn", text: `Points: ${pb.spent}/27 (${pb.remaining} left)` });
      }
      if (s.abilities.method === "roll") button(ctl, "🎲 Roll all six", () => this.change((x) => {
        for (const a of ABILITIES) { const d = [0, 0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)).sort((p, q) => q - p); x.abilities.base[a] = d[0] + d[1] + d[2]; }
        new Notice(`Rolled: ${ABILITIES.map((a) => `${a.toUpperCase()} ${x.abilities.base[a]}`).join(", ")}`);
      }));
      // racial ability choice
      const opts = E.raceAbilityOptions(r, s);
      if (opts.length) {
        const rc = el.createDiv({ cls: "dnd-row dnd-race-ability" });
        const optIdx = Math.min(s.raceAbility.option, opts.length - 1);
        if (opts.length > 1) select(labeled(rc, "Racial bonus"), opts.map((o, i) => ({ value: String(i), label: o.label })), String(optIdx), (v) => this.change((x) => { x.raceAbility = { option: parseInt(v) || 0, picks: [] }; }));
        else labeled(rc, "Racial bonus").setText(opts[0].label || "—");
        const opt = opts[optIdx];
        let pi = 0;
        for (const ch of opt.choose) for (let n = 0; n < ch.count; n++, pi++) {
          const idx = pi;
          select(labeled(rc, `+${ch.amount}`), ch.from.map((a) => ({ value: a, label: ABILITY_NAMES[a], disabled: s.raceAbility.picks.includes(a) && s.raceAbility.picks[idx] !== a })), s.raceAbility.picks[idx] || "", (v) => this.change((x) => { x.raceAbility.picks[idx] = v as Ability; }), "Choose…");
        }
      }
      const free = E.asiSlots(r, s) - E.asiTaken(s);
      if (E.asiSlots(r, s)) el.createDiv({ cls: free < 0 ? "dnd-warn" : "dnd-hint", text: `Ability Score Improvements: ${E.asiTaken(s)}/${E.asiSlots(r, s)} used — add them (or feats) in the Feats section.` });
    }
  }

  // ---------------------------------------------------------------- combat
  private combat(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    const s = this.v, r = this.r;
    const man = this.manual, m = this.s.manual;
    this.section(root, "combat", "Combat", (el) => {
      // manual mode: AC, max HP and speed are typed in instead of computed
      const hp = man ? { max: m.maxHp } : E.hpBreakdown(r, s, sc);
      const ac = man ? { value: m.ac, how: "", stealthDisadvantage: false } : E.armorClass(r, s, sc);
      const cur = E.currentHp(s, hp.max);
      const stats = el.createDiv({ cls: "dnd-combat-stats" });
      const acBox = stats.createDiv({ cls: "dnd-stat" });
      acBox.createDiv({ cls: "dnd-stat-label", text: "Armor Class" });
      acBox.createDiv({ cls: "dnd-stat-value", text: String(ac.value) });
      acBox.createDiv({ cls: "dnd-breakdown", text: ac.how + (ac.stealthDisadvantage ? " · Stealth disadv." : "") });
      if (man) stepper(acBox, m.ac, (v) => this.change((x) => { x.manual.ac = v; }), { min: 0, title: "Armor Class" });
      else stepper(acBox, s.ac.adjust, (v) => this.change((x) => { x.ac.adjust = v; }), { title: "AC adjustment" });
      const ini = E.initiative(r, s, sc);
      const iBox = stats.createDiv({ cls: "dnd-stat" });
      iBox.createDiv({ cls: "dnd-stat-label", text: "Initiative" });
      this.rollable(iBox, fmtMod(ini), d20(ini), "Initiative", "dnd-stat-value");
      stepper(iBox, s.initiativeAdjust, (v) => this.change((x) => { x.initiativeAdjust = v; }), { title: "Initiative adjustment" });
      const sp: Record<string, number> = man ? { walk: m.speed } : E.speeds(r, s);
      const spBox = stats.createDiv({ cls: "dnd-stat dnd-stat-wide" });
      spBox.createDiv({ cls: "dnd-stat-label", text: "Speed" });
      spBox.createDiv({ cls: "dnd-stat-value", text: `${sp.walk} ft.` });
      spBox.createDiv({ cls: "dnd-breakdown", text: Object.entries(sp).filter(([k]) => k !== "walk").map(([k, v]) => `${k} ${v} ft.`).join(", ") });
      if (man) stepper(spBox, m.speed, (v) => this.change((x) => { x.manual.speed = v; }), { min: 0, step: 5, title: "Speed" });
      else stepper(spBox, s.speedAdjust, (v) => this.change((x) => { x.speedAdjust = v; }), { step: 5, title: "Speed adjustment" });

      // hit points
      const hpEl = el.createDiv({ cls: "dnd-hp" });
      // two-column grid: Current HP | Max HP, Temp HP | Exhaustion, Inspiration | Death Saves
      const hpGrid = hpEl.createDiv({ cls: "dnd-hp-grid" });
      stepper(labeled(hpGrid, "Current HP"), cur, (v) => this.change((x) => { x.hp.current = Math.min(v, hp.max); }), { min: 0 });
      if (man) stepper(labeled(hpGrid, "Max HP"), hp.max, (v) => this.change((x) => { x.manual.maxHp = v; }), { min: 1 });
      else stepper(labeled(hpGrid, "Max HP"), hp.max, (v) => this.change((x) => { x.hp.adjust += v - hp.max; }), { min: 1, title: "Adjusts the computed maximum" });
      stepper(labeled(hpGrid, "Temp HP"), s.hp.temp, (v) => this.change((x) => { x.hp.temp = v; }), { min: 0 });
      stepper(labeled(hpGrid, "Exhaustion"), s.exhaustion, (v) => this.change((x) => { x.exhaustion = v; }), { min: 0, max: 6 });
      checkbox(labeled(hpGrid, "Inspiration"), s.inspiration, (v) => this.change((x) => { x.inspiration = v; }));
      const dsRow = labeled(hpGrid, "Death Saves").createDiv({ cls: "dnd-death" });
      // ︎ asks for the text glyph, not the emoji, so the icons take the accent colour
      dsRow.createSpan({ text: "✔︎", cls: "dnd-death-icon" });
      for (let i = 0; i < 3; i++) checkbox(dsRow, s.deathSaves.success > i, (v) => this.change((x) => { x.deathSaves.success = v ? i + 1 : i; }));
      dsRow.createSpan({ text: "✖︎", cls: "dnd-death-icon dnd-death-fail" });
      for (let i = 0; i < 3; i++) checkbox(dsRow, s.deathSaves.fail > i, (v) => this.change((x) => { x.deathSaves.fail = v ? i + 1 : i; }));
      this.rollable(dsRow, "🎲", "1d20", "Death save");
      // last grid row: Hit Dice | Long Rest
      const hd = man ? parseHitDice(m.hitDice) : E.hitDice(r, s);
      const hdTotal = Object.values(hd).reduce((a, b) => a + b, 0) || E.totalLevel(s);
      const hdEl = labeled(hpGrid, "Hit Dice used");
      stepper(hdEl, s.hitDiceUsed, (v) => this.change((x) => { x.hitDiceUsed = v; }), { min: 0, max: hdTotal, total: hdTotal, title: Object.entries(hd).map(([d, n]) => `${n}${d}`).join(" + ") });
      button(labeled(hpGrid, "Rest"), "Long Rest", () => this.change((x) => {
        x.hp.current = hp.max; x.hp.temp = 0; x.slots.used = Array<number>(9).fill(0); x.slots.pactUsed = 0;
        x.hitDiceUsed = Math.max(0, x.hitDiceUsed - Math.max(1, Math.floor(hdTotal / 2))); x.resources = {}; x.deathSaves = { success: 0, fail: 0 };
        if (x.exhaustion > 0) x.exhaustion -= 1;
      }), "dnd-rest-btn");
      // roll a hit die (one button per die type when multiclassed)
      const hdRoll = hpEl.createDiv({ cls: "dnd-row dnd-hd-roll" });
      if (man) this.richText(labeled(hdRoll, "Hit Dice"), m.hitDice, (v) => this.change((x) => { x.manual.hitDice = v; }), { placeholder: "e.g. 3d8 + 2d10", singleLine: true });
      for (const [d, n] of Object.entries(hd)) this.rollable(hdRoll, `🎲 Roll ${d}`, `1${d}${fmtMod(mod(sc.con.total))}`, `Hit die (${d})`).setAttr("aria-label", `Roll a hit die: 1${d}${fmtMod(mod(sc.con.total))} (${n}${d} total)`);

      const conds = el.createDiv({ cls: "dnd-chips" });
      for (const c of E.CONDITIONS) {
        const on = s.conditions.includes(c);
        const chip = conds.createSpan({ text: c, cls: `dnd-chip ${on ? "is-on" : ""}` });
        chip.onclick = () => this.change((x) => { x.conditions = on ? x.conditions.filter((y) => y !== c) : [...x.conditions, c]; });
      }
      const senses = el.createDiv({ cls: "dnd-hint" });
      const dv = E.darkvision(r, s);
      const pb = E.proficiencyBonus(E.totalLevel(s));
      senses.setText([dv ? `Darkvision ${dv} ft.` : "", `Passive Perception ${10 + E.skillBonus(r, s, "perception", sc)}`, `Passive Investigation ${10 + E.skillBonus(r, s, "investigation", sc)}`, `Passive Insight ${10 + E.skillBonus(r, s, "insight", sc)}`, `PB ${fmtMod(pb)}`].filter(Boolean).join(" · "));
    });
  }

  // ---------------------------------------------------------------- skills
  private skills(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    const s = this.v, r = this.r;
    this.section(root, "skills", "Skills", (el) => {
      const prof = E.skillProficiencies(r, s);
      const auto = E.autoSkillSources(r, s);
      const list = el.createDiv({ cls: "dnd-skill-list" });
      for (const [k, a] of Object.entries(E.SKILLS)) {
        const row = list.createDiv({ cls: "dnd-skill" });
        const lvl = prof[k];
        const dot = row.createSpan({ cls: `dnd-prof dnd-prof-${lvl}`, text: ["○", "●", "◉"][lvl], attr: { "aria-label": ["Not proficient", "Proficient", "Expertise"][lvl] + " — click to change" } });
        dot.onclick = () => this.change((x) => { x.skills[k] = (((lvl + 1) % 3) as E.ProfLevel); });
        const bonus = E.skillBonus(r, s, k, sc);
        this.rollable(row, fmtMod(bonus), d20(bonus), title(k), "dnd-skill-bonus");
        this.link(row, title(k), this.plugin.linker.rule("skills", title(k)), "dnd-skill-name");
        row.createSpan({ cls: "dnd-skill-abil", text: a.toUpperCase() });
        if (auto[k]) row.createSpan({ cls: "dnd-skill-src", text: auto[k].join(", ") });
      }
      button(el, "Reset to automatic", () => this.change((x) => { x.skills = {}; }), "dnd-small");
      // skill choices from class / race
      s.classes.forEach((e, i) => {
        const c = r.cls(e.id);
        const rule = i === 0 ? c?.skills[0] : c?.multiclass?.skills[0];
        if (!c || !rule) return;
        this.choiceChips(el, `${c.name}: choose ${rule.count}`, rule.from === "any" ? Object.keys(E.SKILLS) : rule.from, e.skills, rule.count, (v) => this.change((x) => { x.classes[i].skills = v; }));
      });
      const race = r.race(s);
      const rc = race?.skills.choose[0];
      if (rc) this.choiceChips(el, `${race.name}: choose ${rc.count}`, rc.from === "any" ? Object.keys(E.SKILLS) : rc.from, s.raceSkills, rc.count, (v) => this.change((x) => { x.raceSkills = v; }));
    });
  }
  private choiceChips(parent: HTMLElement, label: string, from: string[], chosen: string[], count: number, set: (v: string[]) => void) {
    const box = parent.createDiv({ cls: "dnd-choice" });
    box.createDiv({ cls: "dnd-label", text: `${label} (${chosen.length}/${count})` });
    const chips = box.createDiv({ cls: "dnd-chips" });
    for (const k of from) {
      const on = chosen.includes(k);
      const chip = chips.createSpan({ text: title(k), cls: `dnd-chip ${on ? "is-on" : ""}` });
      chip.onclick = () => { if (on) set(chosen.filter((x) => x !== k)); else if (chosen.length < count) set([...chosen, k]); else new Notice(`You can only choose ${count}.`); };
    }
  }

  // ---------------------------------------------------------------- attacks
  // ---------------------------------------------------------------- hidden sections
  private isHidden(key: string) { return !!this.s.ui.hidden[key]; }
  /** "Hidden sections" button at the top of the sheet, only when some are hidden: a menu to show them again. */
  private hiddenSectionsMenu(root: HTMLElement) {
    const hidden = SECTIONS.filter((x) => this.isHidden(x.key));
    if (!hidden.length) return;
    const bar = root.createDiv({ cls: "dnd-hidden-bar" });
    const btn = button(bar, `Hidden sections (${hidden.length}) ▾`, () => {});
    // the menu opens at the click, so the button takes the mouse event itself
    btn.onclick = (e) => {
      e.preventDefault();
      const menu = new Menu();
      for (const x of hidden) menu.addItem((i) => i.setTitle(x.label).setIcon("eye").onClick(() => this.change((st) => { delete st.ui.hidden[x.key]; })));
      menu.addSeparator();
      menu.addItem((i) => i.setTitle("Show all").setIcon("eye").onClick(() => this.change((st) => { st.ui.hidden = {}; })));
      menu.showAtMouseEvent(e);
    };
  }

  private attacks(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    const atk = E.attacks(this.r, this.s, sc);
    this.section(root, "attacks", "Attacks", (el) => {
      if (!atk.length) {
        // shown even when empty (Sheet template); manual mode has no item data to list weapons from
        el.createDiv({ cls: "dnd-hint", text: this.manual
          ? "Attacks are listed from equipped weapons when rules data is set (Settings → Rules data). Spell attacks are in Spellcasting."
          : "Equip weapons in the Inventory to list attacks here. Spell attacks are in Spellcasting." });
        return;
      }
      const t = el.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table" });
      const h = t.createEl("tr"); ["Weapon", "To Hit", "Damage", "Notes"].forEach((x) => h.createEl("th", { text: x }));
      for (const a of atk) {
        const tr = t.createEl("tr");
        this.link(tr.createEl("td"), a.name, a.link);
        this.rollable(tr.createEl("td"), fmtMod(a.toHit), d20(a.toHit), `${a.name} attack`);
        const dmgCell = tr.createEl("td");
        const formula = a.damage.split(" ")[0];
        this.rollable(dmgCell, a.damage, formula, `${a.name} damage`);
        tr.createEl("td", { text: a.notes });
      }
    });
  }

  // ---------------------------------------------------------------- features
  private raceFeatures(root: HTMLElement) {
    if (this.manual) {
      this.section(root, "race-features", "Race & Background Features", (el) => this.bulletList(el, "race-features", (x) => x.manual.raceFeatures, "Feature or trait…", "+ Add feature"));
      return;
    }
    const s = this.v, r = this.r;
    const race = r.race(s), sub = r.subrace(s), bg = r.background(s);
    this.section(root, "race-features", "Race & Background Features", (el) => {
      const ctx: FeatureCtx = { own: new Set(), hidden: [] };
      if (!race && !bg) el.createDiv({ cls: "dnd-hint", text: "Choose a race and a background to see their features." });
      if (race) {
        const h = el.createDiv({ cls: "dnd-subtitle" }); this.link(h, sub ? `${race.name} (${sub.name})` : race.name, sub?.link || race.link);
        const traits = [...race.traits.map((t) => ({ t, owner: race.id })), ...(sub?.traits || []).map((t) => ({ t, owner: sub!.id }))];
        for (const { t, owner } of traits.filter(({ t }) => !E.RACE_TRAIT_SKIP.has(t.name))) this.dataFeature(el, E.featureKey(owner, t.name), t.name, (sm) => sm.createSpan({ text: t.name, cls: "dnd-feature-name" }), t.text, ctx);
      }
      if (bg) {
        const h = el.createDiv({ cls: "dnd-subtitle" }); this.link(h, `Background: ${bg.name}`, bg.link);
        if (bg.feature) this.dataFeature(el, E.featureKey(bg.id, bg.feature.name), bg.feature.name, (sm) => this.link(sm, bg.feature!.name, bg.feature!.link || bg.link, "dnd-feature-name"), bg.feature.text || "*See the background note.*", ctx);
      }
      this.customFeatures(el, "race", ctx);
    });
  }
  private classFeaturesSection(root: HTMLElement) {
    if (this.manual) {
      this.section(root, "class-features", "Class Features", (el) => this.bulletList(el, "class-features", (x) => x.manual.classFeatures, "Feature (e.g. **Second Wind** — 1d10 + level, short rest)…", "+ Add feature"));
      return;
    }
    const s = this.v, r = this.r;
    this.section(root, "class-features", "Class Features", (el) => {
      const groups = E.classFeatures(r, s);
      const ctx: FeatureCtx = { own: new Set(), hidden: [] };
      if (!groups.length) el.createDiv({ cls: "dnd-hint", text: "Choose a class to see its features." });
      const res = E.classResources(r, s);
      if (res.length) {
        const rr = el.createDiv({ cls: "dnd-resources" });
        for (const x of res) {
          const box = rr.createDiv({ cls: "dnd-resource" });
          box.createDiv({ cls: "dnd-label", text: x.label });
          const max = typeof x.max === "number" ? x.max : parseInt(String(x.max));
          if (Number.isFinite(max) && String(x.max) === String(max) && max > 0 && max <= 30) {
            const left = max - (s.resources[x.key] || 0);
            stepper(box, left, (v) => this.change((st) => { st.resources[x.key] = max - Math.max(0, Math.min(max, v)); }), { min: 0, max });
            box.createDiv({ cls: "dnd-breakdown", text: `of ${max}` });
          } else {
            const t = String(x.max);
            if (/^\d*d\d+/.test(t)) this.rollable(box, t, t, x.label, "dnd-stat-value"); else box.createDiv({ cls: "dnd-stat-value", text: t });
          }
        }
      }
      for (const g of groups) {
        const h = el.createDiv({ cls: "dnd-subtitle" });
        this.link(h, `${g.cls.name} ${g.level}`, g.cls.link);
        if (g.sub) { h.createSpan({ text: " · " }); this.link(h, g.sub.name, g.sub.link); }
        for (const f of g.features) {
          this.dataFeature(el, E.featureKey(g.sub?.features.includes(f) ? g.sub.id : g.cls.id, f.name, f.level), `${f.name} (Lv ${f.level})`, (sm) => {
            sm.createSpan({ cls: "dnd-feature-level", text: `Lv ${f.level}` });
            this.link(sm, f.name, f.link, "dnd-feature-name");
            if (f.optional) sm.createSpan({ cls: "dnd-tag", text: "optional (TCE)" });
          }, f.text, ctx);
        }
      }
      this.customFeatures(el, "class", ctx);
    });
  }
  /**
   * A feature from the rules data, with buttons to hide it (listed under the section, a click shows
   * it again) or remove it (gone from the sheet until it is picked again in "+ Add feature").
   */
  private dataFeature(el: HTMLElement, key: string, name: string, summary: (el: HTMLElement) => void, text: string, ctx: FeatureCtx) {
    ctx.own.add(key);
    if (this.s.removedFeatures.includes(key)) return;
    if (this.s.hiddenFeatures.includes(key)) { ctx.hidden.push({ key, name }); return; }
    this.featureButtons(this.details(el, summary, text, key), key, () => {
      new Notice(`Removed ${name}. To get it back, pick it in "+ Add feature".`);
      this.change((x) => { x.removedFeatures.push(key); });
    });
  }
  /** Hide (by `hideKey`, listed under the section) and remove buttons, together at the end of the feature's summary. */
  private featureButtons(d: HTMLElement, hideKey: string, remove: () => void) {
    const btns = d.querySelector("summary")!.createSpan({ cls: "dnd-feature-btns" });
    iconButton(btns, "eye-off", "Hide this feature", () => this.change((x) => { x.hiddenFeatures.push(hideKey); }), "dnd-feature-btn");
    iconButton(btns, "trash-2", "Remove this feature", remove, "dnd-feature-btn");
  }
  /**
   * The features the player added: from the rules data (shown from the data, with notes) or custom
   * (editable name, level and text). Then the hidden data features to show again, "+ Add feature"
   * (a list of the data's features) and "+ Custom feature". A custom feature just added opens with
   * its name being edited.
   */
  private customFeatures(el: HTMLElement, kind: E.CustomFeature["kind"], ctx: FeatureCtx) {
    const edit = (x: CharState, id: string, set: (f: E.CustomFeature) => void) => { const f = x.customFeatures.find((y) => y.id === id); if (f) set(f); };
    const remove = (id: string) => this.change((x) => { x.customFeatures = x.customFeatures.filter((y) => y.id !== id); });
    const index = E.featureIndex(this.r, kind);
    for (const f of E.customFeatures(this.s, kind)) {
      // already listed above when the character's class, race or background now gives it
      if (f.ref && ctx.own.has(f.ref)) continue;
      // the data's text and link while the feature is in the data, else the copy saved with it
      const data = f.ref ? index.find((x) => x.key === f.ref) : undefined;
      const hideKey = f.ref ?? `custom#${f.id}`;
      if (this.s.hiddenFeatures.includes(hideKey)) { ctx.hidden.push({ key: hideKey, name: data?.name ?? (f.name || "New feature") }); continue; }
      if (f.ref) {
        this.featureButtons(this.details(el, (sm) => {
          if (kind === "class") sm.createSpan({ cls: "dnd-feature-level", text: `Lv ${data?.level ?? f.level}` });
          this.link(sm, data?.name ?? f.name, data?.link, "dnd-feature-name");
          sm.createSpan({ cls: "dnd-tag", text: data?.from ?? "added" });
        }, data?.text ?? f.text, f.ref), hideKey, () => remove(f.id));
        continue;
      }
      const autoEdit = this.focusItem === `feature:${f.id}`;
      if (autoEdit) this.focusItem = null;
      const d = el.createEl("details", { cls: "dnd-details dnd-custom-feature" });
      d.open = autoEdit;
      const sm = d.createEl("summary");
      const lvl = kind === "class" ? sm.createSpan({ cls: "dnd-feature-level", text: `Lv ${f.level}` }) : null;
      const nameEl = sm.createSpan({ cls: "dnd-feature-name", text: f.name || "New feature" });
      sm.createSpan({ cls: "dnd-tag", text: "custom" });
      this.featureButtons(d, hideKey, () => remove(f.id));
      const body = d.createDiv({ cls: "dnd-custom-feature-body" });
      const row = body.createDiv({ cls: "dnd-row dnd-fill" });
      // saved without a re-render so the feature stays open; the summary is updated in place
      this.richText(labeled(row, "Name"), f.name, (v) => { nameEl.setText(v || "New feature"); this.change((x) => edit(x, f.id, (y) => { y.name = v; }), false); }, { placeholder: "Feature name", singleLine: true, autoEdit });
      if (lvl) stepper(labeled(row, "Level", "dnd-field-narrow"), f.level, (v) => { lvl.setText(`Lv ${v}`); this.change((x) => edit(x, f.id, (y) => { y.level = v; }), false); }, { min: 1, max: 20 });
      this.richText(labeled(body, "Text", "dnd-rich-field"), f.text, (v) => this.change((x) => edit(x, f.id, (y) => { y.text = v; }), false), { placeholder: "What it does: uses, range, rulings… Type [[ to link a note." });
    }
    if (ctx.hidden.length) {
      const row = el.createDiv({ cls: "dnd-hidden-features" });
      row.createSpan({ cls: "dnd-label", text: "Hidden" });
      for (const h of ctx.hidden) {
        const chip = row.createSpan({ cls: "dnd-chip", text: h.name, attr: { "aria-label": "Show this feature again" } });
        chip.onclick = () => this.change((x) => { x.hiddenFeatures = x.hiddenFeatures.filter((k) => k !== h.key); });
      }
    }
    const add = el.createDiv({ cls: "dnd-row" });
    // everything not on the sheet: a feature the character has but hid or removed is shown again
    const shown = (k: string) => ctx.own.has(k) && !this.s.hiddenFeatures.includes(k) && !this.s.removedFeatures.includes(k);
    const added = new Set(this.s.customFeatures.map((f) => f.ref).filter(Boolean));
    const items = index.filter((f) => !shown(f.key) && !added.has(f.key));
    if (items.length) button(add, "+ Add feature", () => new Picker(this.app, items, (f) => `${f.name} (${f.from}${f.level != null ? `, level ${f.level}` : ""})`, (f) => this.change((x) => {
      if (ctx.own.has(f.key)) { x.hiddenFeatures = x.hiddenFeatures.filter((k) => k !== f.key); x.removedFeatures = x.removedFeatures.filter((k) => k !== f.key); }
      else x.customFeatures.push(E.addedFeature(kind, f));
    }), kind === "class" ? "Search class and subclass features…" : "Search race traits and background features…", (f) => this.sourceName(f.source)).open(), "dnd-small");
    button(add, "+ Custom feature", () => {
      const f = E.newCustomFeature(kind, E.totalLevel(this.v) || 1);
      this.focusItem = `feature:${f.id}`;
      this.change((x) => { x.customFeatures.push(f); });
    }, "dnd-small");
  }
  private feats(root: HTMLElement) {
    if (this.manual) {
      this.section(root, "feats", "Feats", (el) => this.bulletList(el, "feats", (x) => x.manual.feats, "Feat…", "+ Add feat"));
      return;
    }
    const s = this.v, r = this.r;
    const slots = E.asiSlots(r, s), taken = E.asiTaken(s);
    this.section(root, "feats", `Feats & Ability Score Improvements${slots || taken ? ` (${taken}/${slots})` : ""}`, (el) => {
      if (taken > slots) el.createDiv({ cls: "dnd-warn", text: `${taken} Ability Score Improvement(s)/feat(s) used, but your class levels grant ${slots || "none yet"}. Remove the extra ones.` });
      else if (slots) el.createDiv({ cls: "dnd-hint", text: `Your class levels grant ${slots} Ability Score Improvement(s). Each can be +2 to one ability, +1 to two, or a feat.` });
      s.feats.forEach((fe, i) => {
        const row = el.createDiv({ cls: "dnd-row" });
        if (fe.id === E.ASI_ID) {
          row.createSpan({ cls: "dnd-feature-name", text: "Ability Score Improvement" });
          for (const idx of [0, 1]) select(row, ABILITIES.map((a) => ({ value: a, label: `+1 ${ABILITY_NAMES[a]}` })), fe.picks[idx] || "", (v) => this.change((x) => { x.feats[i].picks[idx] = v as Ability; }), "Ability…");
          iconButton(row, "trash-2", "Remove", () => this.change((x) => { x.feats.splice(i, 1); }));
          return;
        }
        const f = r.feat(fe.id);
        if (!f) return;
        this.details(row, (sm) => { this.link(sm, f.name, f.link, "dnd-feature-name"); if (f.prereq) sm.createSpan({ cls: "dnd-tag", text: f.prereq }); if (fe.free) sm.createSpan({ cls: "dnd-tag", text: "bonus feat" }); }, f.text);
        const opt = f.ability[0];
        let pi = 0;
        for (const ch of opt?.choose || []) for (let n = 0; n < ch.count; n++, pi++) {
          const idx = pi;
          select(row, ch.from.map((a) => ({ value: a, label: `+${ch.amount} ${ABILITY_NAMES[a]}` })), fe.picks[idx] || "", (v) => this.change((x) => { x.feats[i].picks[idx] = v as Ability; }), "Ability…");
        }
        iconButton(row, "trash-2", "Remove feat", () => this.change((x) => { x.feats.splice(i, 1); }));
      });
      const add = el.createDiv({ cls: "dnd-row" });
      button(add, "+ Ability Score Improvement", () => this.change((x) => { x.feats.push({ id: E.ASI_ID, picks: [] }); }));
      // Variant Human / Custom Lineage style bonus feats don't use up an ASI
      const bonusFeat = !!r.race(s)?.feats && !s.feats.some((f) => f.free);
      button(add, bonusFeat ? "+ Add feat (racial bonus feat)" : "+ Add feat", () => new Picker(this.app, r.data.feats, (f) => `${f.name} (${f.source})`, (f) => this.change((x) => { x.feats.push({ id: f.id, picks: [], free: bonusFeat || undefined }); }), "Search feats…", (f) => f.prereq ? `Prerequisite: ${f.prereq}` : "").open());
    });
  }

  // ---------------------------------------------------------------- spellcasting
  private spellcasting(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    if (this.manual) { this.manualSpellcasting(root, sc); return; }
    const s = this.v, r = this.r;
    const casters = E.casters(r, s, sc);
    const slots = E.spellSlots(r, s);
    const granted = E.grantedSpells(r, s);
    this.section(root, "spells", "Spellcasting", (el) => {
      // shown even for characters without spellcasting (Sheet template); hide it from its title
      if (!casters.length && !s.spells.length && !granted.length && !slots.pact) el.createDiv({ cls: "dnd-hint", text: "No spellcasting yet: it appears with a spellcasting class or subclass. You can still add spell slots or spells below." });
      const cs = el.createDiv({ cls: "dnd-casters" });
      for (const c of casters) {
        const box = cs.createDiv({ cls: "dnd-caster" });
        box.createDiv({ cls: "dnd-subtitle", text: c.name });
        const own = s.spells.filter((x) => x.source === c.classId);
        const nPrep = own.filter((x) => x.prepared && (r.spell(x.id)?.level || 0) > 0).length;
        const nCan = own.filter((x) => r.spell(x.id)?.level === 0).length;
        const nKnown = own.filter((x) => (r.spell(x.id)?.level || 0) > 0).length;
        const line = box.createDiv({ cls: "dnd-row" });
        labeled(line, "Ability").setText(ABILITY_NAMES[c.ability]);
        labeled(line, "Spell Save DC").setText(String(c.dc));
        this.rollable(labeled(line, "Spell Attack"), fmtMod(c.attack), d20(c.attack), `${c.name} spell attack`);
        if (c.prepared != null) labeled(line, "Prepared").setText(`${nPrep} / ${c.prepared}`);
        if (c.cantrips) labeled(line, "Cantrips").setText(`${nCan} / ${c.cantrips}`);
        if (c.known) labeled(line, c.prepared != null ? "Spellbook" : "Spells Known").setText(`${nKnown} / ${c.known}${c.prepared != null ? "+" : ""}`);
      }
      // slots
      const st = el.createDiv({ cls: "dnd-slots" });
      st.createDiv({ cls: "dnd-subtitle", text: `Spell Slots${slots.casterLevel ? ` (caster level ${slots.casterLevel})` : ""}` });
      const grid = st.createDiv({ cls: "dnd-slot-grid" });
      for (let i = 0; i < 9; i++) {
        const max = slots.max[i];
        if (!max && !s.slots.adjust[i] && !(i < 9 && slots.max.slice(i).some((n) => n > 0))) continue;
        const cell = grid.createDiv({ cls: "dnd-slot" });
        cell.createDiv({ cls: "dnd-label", text: ORD[i + 1] });
        const boxes = cell.createDiv({ cls: "dnd-slot-boxes" });
        for (let k = 0; k < max; k++) checkbox(boxes, s.slots.used[i] > k, (v) => this.change((x) => { x.slots.used[i] = v ? k + 1 : k; }), "Used");
        stepper(cell, max, (v) => this.change((x) => { x.slots.adjust[i] += v - max; }), { min: 0, title: "Add/remove slots of this level" });
      }
      const addLvl = st.createDiv({ cls: "dnd-row" });
      select(addLvl, ORD.slice(1).map((o, i) => ({ value: String(i), label: `${o} level` })), "", (v) => { if (v !== "") this.change((x) => { x.slots.adjust[parseInt(v)] += 1; }); }, "+ Add a slot of level…");
      if (slots.pact) {
        const pc = st.createDiv({ cls: "dnd-slot dnd-pact" });
        pc.createDiv({ cls: "dnd-label", text: `Pact Magic (${ORD[slots.pact.level]} level)` });
        const boxes = pc.createDiv({ cls: "dnd-slot-boxes" });
        for (let k = 0; k < slots.pact.slots; k++) checkbox(boxes, s.slots.pactUsed > k, (v) => this.change((x) => { x.slots.pactUsed = v ? k + 1 : k; }));
      }
      // spell list
      const list = el.createDiv({ cls: "dnd-spell-list" });
      const head = list.createDiv({ cls: "dnd-row" });
      head.createDiv({ cls: "dnd-subtitle", text: "Spells" });
      button(head, "+ Add spell", () => this.addSpell(casters, false));
      button(head, "+ Any spell", () => this.addSpell(casters, true), "dnd-small");
      const rows = E.sortedSpells(r, s);
      const t = list.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table dnd-spells" });
      const h = t.createEl("tr");
      ["Prep.", "Spell", "Level", "School", "Time", "Range", "", "From", ""].forEach((x) => h.createEl("th", { text: x }));
      let lastPrep: boolean | null = null;
      for (const row of rows) {
        const sp = row.data!;
        const prep = row.entry.prepared || !!row.granted || sp.level === 0;
        if (lastPrep !== null && lastPrep !== prep) { const sep = t.createEl("tr", { cls: "dnd-sep" }); sep.createEl("td", { attr: { colspan: "9" }, text: "Not prepared" }); }
        lastPrep = prep;
        const tr = t.createEl("tr", { cls: prep ? "is-prepared" : "" });
        const pc = tr.createEl("td");
        if (row.granted) pc.createSpan({ text: "★", attr: { "aria-label": `Always prepared (${row.granted})` } });
        else if (sp.level === 0) pc.createSpan({ text: "∞", attr: { "aria-label": "Cantrip" } });
        else checkbox(pc, row.entry.prepared, (v) => this.change((x) => { const e = x.spells.find((y) => y.id === sp.id); if (e) e.prepared = v; }));
        const nameCell = tr.createEl("td");
        this.details(nameCell, (sm) => this.link(sm, sp.name, sp.link, "dnd-feature-name"), `*${sp.level ? ORD[sp.level] + "-level" : "Cantrip"} ${sp.school.toLowerCase()}* · ${sp.components} · ${sp.duration}\n\n${sp.text}`);
        tr.createEl("td", { text: sp.level ? ORD[sp.level] : "C" });
        tr.createEl("td", { text: sp.school });
        tr.createEl("td", { text: sp.time });
        tr.createEl("td", { text: sp.range });
        const cr = tr.createEl("td");
        if (sp.concentration) cr.createSpan({ text: "C ", attr: { "aria-label": "Concentration" } });
        if (sp.ritual) cr.createSpan({ text: "R", attr: { "aria-label": "Ritual" } });
        const from = tr.createEl("td");
        if (row.granted) from.setText(row.granted);
        else if (casters.length > 1) select(from, casters.map((c) => ({ value: c.classId, label: c.name })), row.entry.source || "", (v) => this.change((x) => { const e = x.spells.find((y) => y.id === sp.id); if (e) e.source = v; }), "—");
        else from.setText(casters.find((c) => c.classId === row.entry.source)?.name || "");
        const del = tr.createEl("td");
        if (!row.granted) iconButton(del, "x", "Remove spell", () => this.change((x) => { x.spells = x.spells.filter((y) => y.id !== sp.id); }));
      }
    });
  }
  // Manual mode: spellcasting ability, slots and a typed spell list (prepared ones first)
  private manualSpellcasting(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    const s = this.v, m = this.s.manual;
    this.section(root, "spells", "Spellcasting", (el) => {
      const line = el.createDiv({ cls: "dnd-row" });
      select(labeled(line, "Spellcasting Ability"), ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a] })), m.spellAbility, (v) => this.change((x) => { x.manual.spellAbility = (v || null) as Ability | null; }), "None");
      const c = E.manualCaster(this.s, sc);
      if (c) {
        labeled(line, "Spell Save DC").setText(String(c.dc));
        this.rollable(labeled(line, "Spell Attack"), fmtMod(c.attack), d20(c.attack), "Spell attack");
      }
      // slots: only what the player adds
      const st = el.createDiv({ cls: "dnd-slots" });
      st.createDiv({ cls: "dnd-subtitle", text: "Spell Slots" });
      const grid = st.createDiv({ cls: "dnd-slot-grid" });
      const max = s.slots.adjust.map((n) => Math.max(0, n || 0));
      for (let i = 0; i < 9; i++) {
        if (!max[i] && !max.slice(i).some((n) => n > 0)) continue;
        const cell = grid.createDiv({ cls: "dnd-slot" });
        cell.createDiv({ cls: "dnd-label", text: ORD[i + 1] });
        const boxes = cell.createDiv({ cls: "dnd-slot-boxes" });
        for (let k = 0; k < max[i]; k++) checkbox(boxes, s.slots.used[i] > k, (v) => this.change((x) => { x.slots.used[i] = v ? k + 1 : k; }), "Used");
        stepper(cell, max[i], (v) => this.change((x) => { x.slots.adjust[i] = Math.max(0, v); }), { min: 0, title: "Slots of this level" });
      }
      select(st.createDiv({ cls: "dnd-row" }), ORD.slice(1).map((o, i) => ({ value: String(i), label: `${o} level` })), "", (v) => { if (v !== "") this.change((x) => { x.slots.adjust[parseInt(v)] = Math.max(0, x.slots.adjust[parseInt(v)] || 0) + 1; }); }, "+ Add a slot of level…");
      // spell list
      const list = el.createDiv({ cls: "dnd-spell-list" });
      const head = list.createDiv({ cls: "dnd-row" });
      head.createDiv({ cls: "dnd-subtitle", text: "Spells" });
      button(head, "+ Add spell", () => { this.focusItem = `spell:${m.spells.length}`; this.change((x) => { x.manual.spells.push({ name: "", level: 1, prepared: false }); }); });
      const order = m.spells.map((sp, i) => ({ sp, i })).sort((a, b) => Number(b.sp.prepared || b.sp.level === 0) - Number(a.sp.prepared || a.sp.level === 0) || a.sp.level - b.sp.level || a.sp.name.localeCompare(b.sp.name));
      const t = list.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table dnd-spells dnd-manual-spells" });
      const h = t.createEl("tr");
      ["Prep.", "Spell", "Level", ""].forEach((x) => h.createEl("th", { text: x }));
      let lastPrep: boolean | null = null;
      for (const { sp, i } of order) {
        const prep = sp.prepared || sp.level === 0;
        if (lastPrep !== null && lastPrep !== prep) { const sep = t.createEl("tr", { cls: "dnd-sep" }); sep.createEl("td", { attr: { colspan: "4" }, text: "Not prepared" }); }
        lastPrep = prep;
        const tr = t.createEl("tr", { cls: prep ? "is-prepared" : "" });
        const pc = tr.createEl("td");
        if (sp.level === 0) pc.createSpan({ text: "∞", attr: { "aria-label": "Cantrip" } });
        else checkbox(pc, sp.prepared, (v) => this.change((x) => { x.manual.spells[i].prepared = v; }));
        const autoEdit = this.focusItem === `spell:${i}`;
        if (autoEdit) this.focusItem = null;
        this.richText(tr.createEl("td"), sp.name, (v) => this.change((x) => { x.manual.spells[i].name = v; }), { placeholder: "Spell name (type [[ to link a note)", singleLine: true, autoEdit });
        select(tr.createEl("td"), ORD.map((o, l) => ({ value: String(l), label: o })), String(sp.level), (v) => this.change((x) => { x.manual.spells[i].level = parseInt(v) || 0; }), "—");
        iconButton(tr.createEl("td"), "x", "Remove spell", () => this.change((x) => { x.manual.spells.splice(i, 1); }));
      }
    });
  }
  private addSpell(casters: E.CasterInfo[], any: boolean) {
    const s = this.v, r = this.r;
    const lists = new Set(casters.map((c) => c.list).filter(Boolean) as string[]);
    const have = new Set(s.spells.map((x) => x.id));
    const maxLvl = Math.max(0, ...E.spellSlots(r, s).max.map((n, i) => (n ? i + 1 : 0)), E.spellSlots(r, s).pact?.level || 0);
    const items = r.data.spells.filter((sp) => !have.has(sp.id) && (any || ((!lists.size || casters.some((c) => E.onSpellList(c, sp))) && sp.level <= Math.max(maxLvl, 0))));
    new Picker(this.app, items, (sp) => `${sp.name} (${sp.level ? ORD[sp.level] : "Cantrip"}, ${sp.source})`, (sp) => this.change((x) => {
      const src = casters.find((c) => E.onSpellList(c, sp))?.classId || casters[0]?.classId;
      x.spells.push({ id: sp.id, prepared: false, source: src });
    }), any ? "Search all spells…" : `Search ${[...lists].join("/") || "all"} spells up to ${ORD[maxLvl] || "cantrip"} level…`, (sp) => `${sp.school} · ${sp.classes.join(", ")}`).open();
  }

  // ---------------------------------------------------------------- inventory
  private inventory(root: HTMLElement, sc: Record<Ability, E.AbilityBreakdown>) {
    const s = this.v, r = this.r;
    this.section(root, "inventory", "Inventory & Coins", (el) => {
      const coins = el.createDiv({ cls: "dnd-grid-5 dnd-coins" });
      for (const c of ["cp", "sp", "ep", "gp", "pp"] as const) stepper(labeled(coins, c.toUpperCase()), s.coins[c], (v) => this.change((x) => { x.coins[c] = v; }), { min: 0 });
      const t = el.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table dnd-inv" });
      const h = t.createEl("tr"); ["Item", "Qty", "Weight", "Equipped", "Attuned", "Notes", ""].forEach((x) => h.createEl("th", { text: x }));
      const attuned = s.inventory.filter((i) => i.attuned).length;
      s.inventory.forEach((inv, i) => {
        const it = r.item(inv.id);
        const tr = t.createEl("tr");
        const nameTd = tr.createEl("td");
        if (it) this.link(nameTd, inv.name || it.name, it.link); else this.richText(nameTd, inv.name, (v) => this.change((x) => { x.inventory[i].name = v; }, false), { placeholder: "Item name", singleLine: true });
        if (it?.rarity) nameTd.createSpan({ cls: "dnd-tag", text: it.rarity });
        stepper(tr.createEl("td"), inv.qty, (v) => this.change((x) => { x.inventory[i].qty = v; }), { min: 0 });
        const w = tr.createEl("td");
        const wi = w.createEl("input", { type: "number", value: inv.weight == null ? "" : String(inv.weight), cls: "dnd-num" });
        wi.addEventListener("change", () => this.change((x) => { x.inventory[i].weight = wi.value === "" ? null : parseFloat(wi.value); }));
        const eq = tr.createEl("td");
        if (!it || it.kind !== "gear" || it.bonusAc) checkbox(eq, inv.equipped, (v) => this.change((x) => { x.inventory[i].equipped = v; }));
        const at = tr.createEl("td");
        if (!it || it.attunement) checkbox(at, inv.attuned, (v) => { if (v && attuned >= 3) new Notice("You can be attuned to at most 3 items."); this.change((x) => { x.inventory[i].attuned = v; }); });
        this.richText(tr.createEl("td"), inv.notes, (v) => this.change((x) => { x.inventory[i].notes = v; }, false), { placeholder: "—", singleLine: true });
        iconButton(tr.createEl("td"), "trash-2", "Remove", () => this.change((x) => { x.inventory.splice(i, 1); }));
      });
      const add = el.createDiv({ cls: "dnd-row" });
      if (r.data.items.length) button(add, "+ Add item from compendium", () => new Picker(this.app, r.data.items, (it) => `${it.name} (${it.source})`, (it) => this.change((x) => {
        x.inventory.push({ id: it.id, name: it.name, qty: 1, weight: it.weight, equipped: it.kind !== "gear", attuned: false, notes: "" });
      }), "Search items…", (it) => [it.kind, it.rarity, it.weight != null ? `${it.weight} lb.` : "", it.value != null ? `${it.value / 100} gp` : ""].filter(Boolean).join(" · ")).open());
      button(add, "+ Custom item", () => this.change((x) => { x.inventory.push({ id: null, name: "", qty: 1, weight: null, equipped: false, attuned: false, notes: "" }); }));
      const wt = E.inventoryWeight(s), cap = E.carryingCapacity(sc);
      el.createDiv({ cls: wt > cap ? "dnd-warn" : "dnd-hint", text: `Carried: ${Math.round(wt * 10) / 10} lb. / capacity ${cap} lb. · Attuned items: ${attuned}/3` });
    });
  }

  // ---------------------------------------------------------------- proficiencies, personality
  private proficiencies(root: HTMLElement) {
    const s = this.v, r = this.r;
    this.section(root, "profs", "Proficiencies & Languages", (el) => {
      const first = s.classes[0] ? r.cls(s.classes[0].id) : null;
      const multi = s.classes.slice(1).map((e) => r.cls(e.id)).filter(Boolean) as E.ClassData[];
      const race = r.race(s), sub = r.subrace(s), bg = r.background(s);
      const auto = {
        armor: [...(first?.armor || []), ...multi.flatMap((c) => c.multiclass?.armor || []), ...(race?.armor.fixed || [])],
        weapons: [...(first?.weapons || []), ...multi.flatMap((c) => c.multiclass?.weapons || []), ...(race?.weapons.fixed || [])],
        tools: [...(first?.tools || []), ...(race?.tools.fixed || []), ...(bg?.tools.fixed || [])],
        languages: [...(race?.languages || []), ...(sub?.languages || []), ...(bg?.languages || [])],
      };
      for (const k of ["armor", "weapons", "tools", "languages"] as const) {
        const f = labeled(el, title(k), "dnd-prof-field");
        const uniq = [...new Set(auto[k].map((x) => x.replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, "$1")))];
        if (uniq.length) f.createDiv({ cls: "dnd-auto", text: uniq.join(", ") });
        this.richText(f, s.proficiencies[k], (v) => this.change((x) => { x.proficiencies[k] = v; }, false), { placeholder: "Other / chosen…", singleLine: true });
      }
    });
  }
  private personality(root: HTMLElement) {
    const s = this.v;
    this.section(root, "personality", "Personality & Appearance", (el) => {
      const g = el.createDiv({ cls: "dnd-grid-2" });
      for (const k of ["traits", "ideals", "bonds", "flaws"] as const) this.richText(labeled(g, title(k === "traits" ? "personality traits" : k), "dnd-rich-field"), s.personality[k], (v) => this.change((x) => { x.personality[k] = v; }, false), { placeholder: "Click to write…" });
      const a = el.createDiv({ cls: "dnd-grid-3 dnd-appearance" });
      for (const k of ["age", "height", "weight", "eyes", "skin", "hair"] as const) this.richText(labeled(a, title(k)), s.appearance[k], (v) => this.change((x) => { x.appearance[k] = v; }, false), { placeholder: "—", singleLine: true });
      this.richText(labeled(el, "Allies & Organizations", "dnd-rich-field"), s.allies, (v) => this.change((x) => { x.allies = v; }, false), { placeholder: "Click to write… Type [[ to link a note." });
    }, undefined);
  }

  // ---------------------------------------------------------------- biography, diary, events
  /** which bullet list item should open in edit mode on the next render ("list-key:index") */
  private focusItem: string | null = null;
  private biography(root: HTMLElement) {
    const s = this.v;
    this.section(root, "biography", "Biography & Diary", (el) => {
      this.richText(labeled(el, "Biography", "dnd-rich-field"), s.biography, (v) => this.change((x) => { x.biography = v; }, false), { placeholder: "Click to write the background, history, goals… Type [[ to link a note." });
      this.richText(labeled(el, "Diary", "dnd-rich-field"), s.diary, (v) => this.change((x) => { x.diary = v; }, false), { placeholder: "Click to write session notes… Type [[ to link a note." });
      this.bulletList(labeled(el, "Events", "dnd-events"), "events", (x) => x.events, "Describe the event…", "+ Add event");
    });
  }

  /**
   * Editable bullet list: [delete] • text. Enter saves and starts a new item below
   * (Shift+Enter = new line); an item left empty is removed.
   */
  private bulletList(parent: HTMLElement, key: string, items: (s: CharState) => string[], placeholder: string, addLabel: string) {
    const list = parent.createDiv({ cls: "dnd-event-list" });
    items(this.s).forEach((text, i) => {
      const row = list.createDiv({ cls: "dnd-event" });
      iconButton(row, "trash-2", "Remove", () => this.change((x) => { items(x).splice(i, 1); }));
      row.createSpan({ cls: "dnd-event-bullet", text: "•" });
      const autoEdit = this.focusItem === `${key}:${i}`;
      if (autoEdit) this.focusItem = null;
      this.richText(row, text, (v) => {
        if (!v.trim()) this.change((x) => { items(x).splice(i, 1); });
        else this.change((x) => { items(x)[i] = v; }, false);
      }, {
        placeholder, inline: true, autoEdit,
        onEnter: (v) => { this.focusItem = `${key}:${i + 1}`; this.change((x) => { items(x)[i] = v; items(x).splice(i + 1, 0, ""); }); },
      });
    });
    button(parent, addLabel, () => { this.focusItem = `${key}:${items(this.s).length}`; this.change((x) => { items(x).push(""); }); }, "dnd-small");
  }

  // Markdown text shown rendered (clickable [[links]] with page preview); click it to edit.
  // While editing, typing [[ opens a note picker that inserts the link.
  private richText(parent: HTMLElement, initial: string, save: (v: string) => void, o: { placeholder: string; inline?: boolean; singleLine?: boolean; autoEdit?: boolean; onEnter?: (v: string) => void }) {
    let value = initial || "";
    const box = parent.createDiv({ cls: `dnd-richtext${o.inline || o.singleLine ? " is-inline" : ""}${o.singleLine ? " is-single" : ""}` });
    const view = () => {
      box.empty(); box.removeClass("is-editing");
      const v = box.createDiv({ cls: "dnd-richtext-view", attr: { "aria-label": "Click to edit" } });
      if (value.trim()) this.md(v, value); else v.createSpan({ cls: "dnd-placeholder", text: o.placeholder });
      v.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (a?.hasClass("internal-link")) { e.preventDefault(); void this.app.workspace.openLinkText(a.getAttr("data-href") || a.getText(), this.sourcePath, e.ctrlKey || e.metaKey); return; }
        if (a) return; // external links open normally
        edit();
      });
      v.addEventListener("mouseover", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("a.internal-link");
        if (a) this.app.workspace.trigger("hover-link", { event: e, source: "preview", hoverParent: this, targetEl: a, linktext: a.getAttr("data-href") || a.getText(), sourcePath: this.sourcePath });
      });
    };
    const edit = () => {
      box.empty(); box.addClass("is-editing");
      const ta = box.createEl("textarea", { cls: "dnd-textarea" });
      ta.value = value;
      autoGrow(ta, o.inline || o.singleLine ? 0 : 72);
      let picking = false, done = false;
      const finish = (commit: boolean) => {
        if (done) return;
        done = true;
        if (commit && ta.value !== value) { value = ta.value; save(value); }
        view();
      };
      ta.addEventListener("blur", () => { if (!picking) finish(true); });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
        else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
        else if (o.singleLine && e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (o.onEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); done = true; value = ta.value; o.onEnter(value); }
      });
      ta.addEventListener("input", () => {
        const pos = ta.selectionStart;
        if (ta.value.slice(pos - 2, pos) !== "[[") return;
        picking = true;
        const p = new Picker(this.app, this.app.vault.getMarkdownFiles(), (f) => f.path.replace(/\.md$/, ""), (f) => {
          ta.setRangeText(`${this.app.metadataCache.fileToLinktext(f, this.sourcePath, true)}]]`, pos, pos, "end");
        }, "Link to a note…");
        p.onClosed = () => { picking = false; ta.focus(); ta.dispatchEvent(new Event("input")); };
        p.open();
      });
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };
    if (o.autoEdit) edit(); else view();
    return box;
  }
}

/** "2d6 + 3d10" -> { d6: 2, d10: 3 } (manual-mode hit dice) */
function parseHitDice(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of (text || "").matchAll(/(\d*)\s*d\s*(\d+)/gi)) out[`d${m[2]}`] = (out[`d${m[2]}`] || 0) + (parseInt(m[1]) || 1);
  return out;
}

// textarea that grows with its content instead of scrolling
function autoGrow(t: HTMLTextAreaElement, min = 96) {
  const fit = () => { t.setCssStyles({ height: "auto" }); t.setCssStyles({ height: `${Math.max(t.scrollHeight + 2, min)}px` }); };
  t.addEventListener("input", fit);
  window.requestAnimationFrame(fit);
  return t;
}
