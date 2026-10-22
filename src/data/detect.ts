// Finds 5etools data folders, 5etools homebrew files and ttrpg-convert-cli compendiums inside the
// vault, for the "Detect" button of the import settings. Only runs when the user asks for it.

/** What the scan needs from the vault adapter (paths are vault paths, "" is the root). */
export interface DetectFs {
  list(dir: string): Promise<{ files: string[]; folders: string[] }>;
  read(path: string): Promise<string>;
  size(path: string): Promise<number | null>;
}
export interface DetectedHomebrew { path: string; sources: string[] }
export interface Detected {
  /** folders with the data files of a 5etools copy (races.json, backgrounds.json, class/index.json) */
  dataFolders: string[];
  /** JSON files in the 5etools homebrew format (a `_meta` with `sources`), with their book names */
  homebrew: DetectedHomebrew[];
  /** folders with the "compendium" and "rules" folders of a ttrpg-convert-cli compendium */
  compendiums: string[];
  /** the scan stopped reading JSON files at `maxReads`, so some homebrew may be missing */
  truncated: boolean;
}
export interface DetectOptions {
  /** folder names never entered; the plugin adds the vault's config folder (Vault#configDir) */
  skip?: string[];
  maxDepth?: number;
  /** larger JSON files are not read */
  maxBytes?: number;
  /** at most this many JSON files are read */
  maxReads?: number;
}

/** version control, Obsidian's trash and packages */
export const SKIP_FOLDERS = [".git", ".trash", "node_modules"];
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** The book names of a 5etools homebrew file, or null when the JSON is not one. */
export function homebrewSources(json: unknown): string[] | null {
  const meta = (json as { _meta?: { sources?: unknown } } | null)?._meta;
  if (!meta || !Array.isArray(meta.sources) || !meta.sources.length) return null;
  return meta.sources.map((s: { full?: unknown; json?: unknown; abbreviation?: unknown }) => {
    const name = [s?.full, s?.abbreviation, s?.json].find((x) => typeof x === "string" && x);
    return typeof name === "string" ? name : "?";
  });
}

export async function detect(fs: DetectFs, o: DetectOptions = {}): Promise<Detected> {
  const skip = new Set(o.skip ?? SKIP_FOLDERS);
  const maxDepth = o.maxDepth ?? 10, maxBytes = o.maxBytes ?? 20 * 1024 * 1024, maxReads = o.maxReads ?? 500;
  const out: Detected = { dataFolders: [], homebrew: [], compendiums: [], truncated: false };
  const candidates: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let listed: { files: string[]; folders: string[] };
    try { listed = await fs.list(dir); } catch { return; }
    const files = new Set(listed.files.map(base)), folders = new Set(listed.folders.map(base));
    // the settings can't name the vault root (empty means "not set"), so only folders count
    if (dir && files.has("races.json") && files.has("backgrounds.json") && folders.has("class")) {
      // a 5etools data folder: its files are official data, not homebrew, so it is not searched further
      try { if ((await fs.list(dir ? `${dir}/class` : "class")).files.some((f) => base(f) === "index.json")) { out.dataFolders.push(dir); return; } } catch { /* not one */ }
    }
    if (dir && folders.has("compendium") && folders.has("rules")) out.compendiums.push(dir);
    candidates.push(...listed.files.filter((f) => f.toLowerCase().endsWith(".json")));
    if (depth >= maxDepth) return;
    for (const f of listed.folders.sort()) if (!skip.has(base(f))) await walk(f, depth + 1);
  };
  await walk("", 0);
  let reads = 0;
  for (const path of candidates.sort()) {
    if (reads >= maxReads) { out.truncated = true; break; }
    const size = await fs.size(path).catch(() => null);
    if (size == null || size > maxBytes) continue;
    reads++;
    let text: string;
    try { text = await fs.read(path); } catch { continue; }
    // cheap check before parsing: homebrew always has a "_meta" key
    if (!text.includes("\"_meta\"")) continue;
    try {
      const sources = homebrewSources(JSON.parse(text));
      if (sources) out.homebrew.push({ path, sources });
    } catch { /* not JSON */ }
  }
  return out;
}
