// Creates a demo user and a small pre-processed demo document.
const bcrypt = require("bcryptjs");
const db = require("./src/db");
const { chunkPage } = require("./src/lib");
const { embed } = require("./src/ai");

const EMAIL = "demo@example.com", PASSWORD = "demo12345";
const pages = [
  "Acme Robotics Employee Handbook. Welcome to Acme Robotics. Our mission is to build safe, affordable warehouse robots. Core values: safety first, customer obsession, and honest communication.",
  "Leave policy. Full-time employees receive 24 days of paid annual leave per year. Sick leave is 10 days per year. Parental leave is 16 weeks fully paid for all parents.",
  "Remote work. Employees may work remotely up to three days per week. Core collaboration hours are 11:00 to 15:00 local time. Equipment stipend: 800 USD every two years.",
];
(async () => {
  db.prepare("DELETE FROM users WHERE email=?").run(EMAIL);
  const uid = db.prepare("INSERT INTO users(email,password_hash) VALUES(?,?)").run(EMAIL, bcrypt.hashSync(PASSWORD, 10)).lastInsertRowid;
  const did = db.prepare("INSERT INTO documents(user_id,name,status,pages) VALUES(?,?,?,?)").run(uid, "Acme-Handbook-demo.pdf", "ready", pages.length).lastInsertRowid;
  const chunks = pages.flatMap((t, i) => chunkPage(t).map((text) => ({ page: i + 1, text })));
  let vecs; try { vecs = await embed(chunks.map((c) => c.text)); } catch { vecs = chunks.map(() => null); }
  const ins = db.prepare("INSERT INTO chunks(document_id,page,text,embedding) VALUES(?,?,?,?)");
  chunks.forEach((c, i) => ins.run(did, c.page, c.text, vecs[i] ? JSON.stringify(vecs[i]) : null));
  console.log(`Seeded. Login: ${EMAIL} / ${PASSWORD}` + (vecs[0] ? "" : " (no embeddings: set GEMINI_API_KEY and re-run for semantic search)"));
})();
