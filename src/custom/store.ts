// The custom data file in the vault, read and written through the vault adapter: it is in a hidden
// folder (".5e-character-sheet" by default), which the vault's file list does not include.
import { normalizeCustomFile, emptyCustomFile, type CustomFile } from "./format.ts";

/** The parts of Obsidian's DataAdapter used here (a fake one in the tests). */
export interface FileAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}
export const DEFAULT_CUSTOM_PATH = ".5e-character-sheet/custom-data.json";

/** The file at `path` (none yet: empty). `error`: it could not be read as JSON, and is left as it is. */
export async function loadCustom(a: FileAdapter, path: string): Promise<{ file: CustomFile; warnings: string[]; error: string | null }> {
  if (!(await a.exists(path))) return { file: emptyCustomFile(), warnings: [], error: null };
  let raw: unknown;
  try {
    raw = JSON.parse(await a.read(path));
  } catch (e) {
    return { file: emptyCustomFile(), warnings: [], error: `${path} is not valid JSON (${(e as Error).message}). Fix it, or the next change made here replaces it.` };
  }
  return { ...normalizeCustomFile(raw), error: null };
}

/** Write the file, making its folders first; indented, as it may be read or edited by hand. */
export async function saveCustom(a: FileAdapter, path: string, file: CustomFile) {
  const parts = path.split("/").slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    if (dir && !(await a.exists(dir))) await a.mkdir(dir);
  }
  await a.write(path, JSON.stringify(file, null, 2) + "\n");
}
