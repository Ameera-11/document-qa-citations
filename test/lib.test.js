const test = require("node:test");
const assert = require("node:assert");
const { chunkPage, cosine, rank, keywordScore, validEmail, validPassword } = require("../src/lib");

test("chunkPage splits long text, bounds size, keeps all words", () => {
  const text = Array.from({ length: 600 }, (_, i) => "word" + i).join(" ");
  const chunks = chunkPage(text, 500, 50);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 500));
  assert.ok(chunks[0].includes("word0") && chunks.at(-1).includes("word599"));
});
test("chunkPage returns nothing for empty text", () => assert.deepStrictEqual(chunkPage("   "), []));
test("cosine similarity: identical = 1, orthogonal = 0", () => {
  assert.ok(Math.abs(cosine([1, 2], [1, 2]) - 1) < 1e-9);
  assert.strictEqual(cosine([1, 0], [0, 1]), 0);
});
test("rank uses embeddings when every chunk has one", () => {
  const chunks = [{ text: "a", embedding: "[0,1]" }, { text: "b", embedding: "[1,0]" }];
  assert.strictEqual(rank("q", [1, 0], chunks, 1)[0].text, "b");
});
test("rank falls back to keywords when embeddings are missing", () => {
  const chunks = [{ text: "pasta recipe", embedding: null }, { text: "annual leave policy days", embedding: null }];
  assert.strictEqual(rank("leave policy", [1], chunks, 1)[0].text, "annual leave policy days");
  assert.strictEqual(keywordScore("zzz", "nothing here"), 0);
});
test("input validators", () => {
  assert.ok(validEmail("a@b.co") && !validEmail("nope"));
  assert.ok(validPassword("12345678") && !validPassword("short"));
});
