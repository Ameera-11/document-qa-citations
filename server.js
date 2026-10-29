const express = require("express");
const multer = require("multer");
const pdf = require("pdf-parse");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./src/db");
const { chunkPage, rank, validEmail, validPassword } = require("./src/lib");
const { embed, answer } = require("./src/ai");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

// ---- auth ----
const token = (id) => jwt.sign({ id }, SECRET, { expiresIn: "7d" });
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  try { req.user = jwt.verify(h.replace(/^Bearer /, ""), SECRET); next(); }
  catch { res.status(401).json({ error: "Please log in." }); }
}
app.post("/api/register", (req, res) => {
  const { email, password } = req.body || {};
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!validPassword(password)) return res.status(400).json({ error: "Password must be 8-100 characters." });
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email.toLowerCase()))
    return res.status(409).json({ error: "That email is already registered." });
  const id = db.prepare("INSERT INTO users(email,password_hash) VALUES(?,?)").run(email.toLowerCase(), bcrypt.hashSync(password, 10)).lastInsertRowid;
  res.status(201).json({ token: token(id) });
});
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const u = validEmail(email) && typeof password === "string" && db.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase());
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token: token(u.id) });
});

// ---- documents ----
async function extractPages(buffer) {
  const pages = [];
  await pdf(buffer, { pagerender: async (p) => {
    const tc = await p.getTextContent();
    const text = tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    pages.push({ n: p.pageNumber, text }); return text;
  } });
  return pages.sort((a, b) => a.n - b.n);
}

// Runs after the HTTP response, so large PDFs never block the app.
async function processDoc(id, buffer) {
  try {
    const pages = await extractPages(buffer);
    const chunks = pages.flatMap((p) => chunkPage(p.text).map((text) => ({ page: p.n, text })));
    if (!chunks.length) throw new Error("No selectable text found (scanned PDFs are not supported).");
    let vecs;
    try { vecs = await embed(chunks.map((c) => c.text)); } catch { vecs = chunks.map(() => null); } // keyword fallback
    const ins = db.prepare("INSERT INTO chunks(document_id,page,text,embedding) VALUES(?,?,?,?)");
    db.transaction(() => {
      chunks.forEach((c, i) => ins.run(id, c.page, c.text, vecs[i] ? JSON.stringify(vecs[i]) : null));
      db.prepare("UPDATE documents SET status='ready', pages=? WHERE id=?").run(pages.length, id);
    })();
  } catch (e) {
    db.prepare("UPDATE documents SET status='error', error=? WHERE id=?").run(String(e.message).slice(0, 300), id);
  }
}

app.get("/api/documents", auth, (req, res) =>
  res.json(db.prepare("SELECT id,name,status,error,pages FROM documents WHERE user_id=? ORDER BY id DESC").all(req.user.id)));

app.post("/api/documents", auth, upload.single("file"), (req, res) => {
  const f = req.file;
  if (!f || f.mimetype !== "application/pdf" || f.buffer.subarray(0, 4).toString() !== "%PDF")
    return res.status(400).json({ error: "Please upload a valid PDF file." });
  const id = db.prepare("INSERT INTO documents(user_id,name) VALUES(?,?)").run(req.user.id, f.originalname.slice(0, 200)).lastInsertRowid;
  res.status(202).json({ id, status: "processing" });
  processDoc(id, f.buffer);
});

app.delete("/api/documents/:id", auth, (req, res) => {
  const r = db.prepare("DELETE FROM documents WHERE id=? AND user_id=?").run(+req.params.id, req.user.id);
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: "Document not found." });
});

// ---- ask: one document (docId) or all of the user's documents ----
app.post("/api/ask", auth, async (req, res) => {
  const { question, docId } = req.body || {};
  if (typeof question !== "string" || !question.trim() || question.length > 1000)
    return res.status(400).json({ error: "Enter a question (up to 1000 characters)." });
  if (docId != null && !Number.isInteger(docId)) return res.status(400).json({ error: "Invalid document." });
  // The user_id filter is the security boundary: users can only ever search their own documents.
  let sql = "SELECT c.page,c.text,c.embedding,d.name AS doc FROM chunks c JOIN documents d ON d.id=c.document_id WHERE d.user_id=? AND d.status='ready'";
  const args = [req.user.id];
  if (docId != null) { sql += " AND d.id=?"; args.push(docId); }
  const chunks = db.prepare(sql).all(...args);
  if (!chunks.length) return res.status(docId != null ? 404 : 400).json({ error: docId != null ? "Document not found or not ready." : "Upload a document first, and wait until it is ready." });
  try {
    let qvec = null;
    try { qvec = (await embed([question]))[0]; } catch {}
    const sources = rank(question, qvec, chunks).map((c) => ({ doc: c.doc, page: c.page, text: c.text }));
    res.json({ answer: await answer(question, sources), sources });
  } catch (e) { res.status(502).json({ error: "AI request failed: " + e.message }); }
});

app.use((err, req, res, next) => res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 20 MB)." : "Bad request." }));

module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("Running on http://localhost:" + port));
}
