// Vault paths and file names. Pure (no Obsidian imports) so it can be unit tested in Node.

/**
 * Where `path` is after the file or folder at `from` was renamed or moved to `to`: `to` for the
 * item itself, the new place for anything inside a folder, null when it was not affected.
 */
export function renamedPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? to + path.slice(from.length) : null;
}

