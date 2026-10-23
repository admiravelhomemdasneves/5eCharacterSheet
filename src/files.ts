// Vault paths and file names. Pure (no Obsidian imports) so it can be unit tested in Node.

/**
 * Where `path` is after the file or folder at `from` was renamed or moved to `to`: `to` for the
 * item itself, the new place for anything inside a folder, null when it was not affected.
 */
export function renamedPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? to + path.slice(from.length) : null;
}

/** characters Obsidian does not allow in file names */
const FORBIDDEN = /[\\/:*?"<>|]/g;
/**
 * Why a character name can't be used as its note's file name, or null when it can: no characters
 * Obsidian forbids, not only dots, no space or dot at the end (Windows drops them).
 */
export function fileNameProblem(name: string): string | null {
  const bad = [...new Set(name.match(FORBIDDEN) ?? [])];
  if (bad.length) return `A name can't contain ${bad.join(" ")}`;
  if (/^\.+$/.test(name)) return "A name can't be only dots";
  if (/[. ]$/.test(name)) return "A name can't end with a dot or a space";
  return null;
}
