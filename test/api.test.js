process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert");
const app = require("../server");
const db = require("../src/db");

let base, server;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = "http://localhost:" + server.address().port; r(); }); }));
test.after(() => server.close());

const post = (path, body, tok) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(tok && { Authorization: "Bearer " + tok }) }, body: JSON.stringify(body) });
async function user(email) { return (await (await post("/api/register", { email, password: "password123" })).json()).token; }
function addDoc(token, name) { // insert a ready document for the user owning `token`
  const uid = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()).id;
  const id = db.prepare("INSERT INTO documents(user_id,name,status,pages) VALUES(?,?, 'ready',1)").run(uid, name).lastInsertRowid;
  db.prepare("INSERT INTO chunks(document_id,page,text) VALUES(?,?,?)").run(id, 1, "secret " + name + " content");
  return Number(id);
}

test("register rejects weak passwords and bad emails", async () => {
  assert.strictEqual((await post("/api/register", { email: "x@y.com", password: "123" })).status, 400);
  assert.strictEqual((await post("/api/register", { email: "bad", password: "password123" })).status, 400);
});
test("register then login works; wrong password fails", async () => {
  await user("a@test.com");
  assert.strictEqual((await post("/api/login", { email: "a@test.com", password: "password123" })).status, 200);
  assert.strictEqual((await post("/api/login", { email: "a@test.com", password: "wrongpass1" })).status, 401);
});
test("endpoints require a login", async () => {
  assert.strictEqual((await post("/api/ask", { question: "hi" })).status, 401);
  assert.strictEqual((await fetch(base + "/api/documents")).status, 401);
});
test("a user cannot ask about another user's document", async () => {
  const alice = await user("alice@test.com"), bob = await user("bob@test.com");
  const aliceDoc = addDoc(alice, "alice.pdf");
  assert.strictEqual((await post("/api/ask", { question: "what is secret?", docId: aliceDoc }, bob)).status, 404);
  assert.strictEqual((await post("/api/ask", { question: "what is secret?", docId: aliceDoc }, alice)).status, 200);
});
test("'all documents' scope only searches the caller's own documents", async () => {
  const carol = await user("carol@test.com"), dan = await user("dan@test.com");
  addDoc(carol, "carol.pdf"); addDoc(dan, "dan.pdf");
  const r = await (await post("/api/ask", { question: "secret content" }, carol)).json();
  assert.ok(r.sources.length > 0 && r.sources.every((s) => s.doc === "carol.pdf"));
});
test("ask validates the question", async () => {
  const t = await user("eve@test.com");
  assert.strictEqual((await post("/api/ask", { question: "" }, t)).status, 400);
  assert.strictEqual((await post("/api/ask", { question: "x".repeat(1001) }, t)).status, 400);
});
test("upload rejects non-PDF files", async () => {
  const t = await user("frank@test.com");
  const fd = new FormData(); fd.append("file", new Blob(["hello"], { type: "text/plain" }), "a.txt");
  const r = await fetch(base + "/api/documents", { method: "POST", headers: { Authorization: "Bearer " + t }, body: fd });
  assert.strictEqual(r.status, 400);
});
