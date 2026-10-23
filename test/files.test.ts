import { test } from "node:test";
import assert from "node:assert/strict";
import { fileNameProblem, renamedPath } from "../src/files.ts";

test("renamed paths: the item itself, what is inside a renamed folder, and nothing else", () => {
  assert.equal(renamedPath("Heroes/Ann.md", "Heroes/Ann.md", "Heroes/Anna.md"), "Heroes/Anna.md");
  assert.equal(renamedPath("Heroes/Ann.md", "Heroes", "Party"), "Party/Ann.md");
  assert.equal(renamedPath("Heroes/Old/Ann.md", "Heroes", "Archive/Heroes"), "Archive/Heroes/Old/Ann.md");
  // a folder whose name starts the same is another folder
  assert.equal(renamedPath("Heroes 2/Ann.md", "Heroes", "Party"), null);
  assert.equal(renamedPath("Ann.md", "Bob.md", "Rob.md"), null);
});

test("file name problems: characters Obsidian forbids, only dots, a dot or space at the end", () => {
  for (const ok of ["Ann", "Sir Ann the Brave", "Ann (level 3)", "Ann's", "Ann.v2", "Ånn Ñ 日本"]) assert.equal(fileNameProblem(ok), null, ok);
  assert.equal(fileNameProblem("Ann/Bob"), "A name can't contain /");
  assert.equal(fileNameProblem("Who? Me: *really*"), "A name can't contain ? : *");
  for (const bad of ["a\\b", "a<b", "a>b", "a\"b", "a|b"]) assert.match(fileNameProblem(bad)!, /can't contain/, bad);
  assert.match(fileNameProblem("..")!, /only dots/);
  assert.match(fileNameProblem("Ann.")!, /end with/);
  assert.match(fileNameProblem("Ann ")!, /end with/);
});
