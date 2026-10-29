// Pure helpers (no I/O) so they are easy to unit test.
const STOP = new Set("the a an of to in is are was were and or for on with as by at from that this it be what how why when who which do does did can".split(" "));
const tokens = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));

// Split one page into overlapping chunks; every chunk keeps its page number via the caller.
function chunkPage(text, size = 1000, overlap = 150) {
  text = (text || "").replace(/\s+/g, " ").trim();
  const out = [];
  for (let i = 0; i < text.length; ) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) { const sp = text.lastIndexOf(" ", end); if (sp > i + size / 2) end = sp; }
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = end - overlap;
  }
  return out;
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

function keywordScore(question, text) {
  const q = new Set(tokens(question)); if (!q.size) return 0;
  const t = new Set(tokens(text)); let hit = 0;
  q.forEach((w) => t.has(w) && hit++);
  return hit / q.size;
}

// Rank chunks by embedding similarity; fall back to keywords if vectors are missing.
function rank(question, qvec, chunks, k = 6) {
  const useVec = qvec && chunks.length && chunks.every((c) => c.embedding);
  return chunks
    .map((c) => ({ c, s: useVec ? cosine(qvec, JSON.parse(c.embedding)) : keywordScore(question, c.text) }))
    .sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.c);
}

const validEmail = (e) => typeof e === "string" && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validPassword = (p) => typeof p === "string" && p.length >= 8 && p.length <= 100;
module.exports = { chunkPage, cosine, keywordScore, rank, validEmail, validPassword };
