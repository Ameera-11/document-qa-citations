const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const GEN = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const EMB = process.env.EMBED_MODEL || "gemini-embedding-001";
const TEST = process.env.NODE_ENV === "test";

async function call(model, method, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${BASE}${model}:${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) return d;
    const retryable = [429, 500, 503].includes(r.status);
    if (!retryable || i === tries - 1) throw new Error(d.error?.message || "Gemini request failed");
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
  }
}

async function embed(texts) {
  if (TEST) return texts.map(() => null);
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const d = await call(EMB, "batchEmbedContents", {
      requests: batch.map((t) => ({ model: "models/" + EMB, content: { parts: [{ text: t }] } })),
    });
    out.push(...d.embeddings.map((e) => e.values));
  }
  return out;
}

// sources: [{doc, page, text}] -> the model cites them as [S1], [S2]...
async function answer(question, sources) {
  if (TEST) return "Test answer [S1]";
  const ctx = sources.map((s, i) => `[S${i + 1}] (${s.doc}, page ${s.page})\n${s.text}`).join("\n\n");
  const d = await call(GEN, "generateContent", {
    systemInstruction: { parts: [{ text:
      "Answer using ONLY the sources provided. After each claim cite each source separately like [S2][S3], never grouped as [S2, S3]. " +
      "If the sources do not contain the answer, say so plainly and cite nothing. Never invent facts." }] },
    contents: [{ role: "user", parts: [{ text: `${ctx}\n\nQuestion: ${question}` }] }],
  });
  return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
}
module.exports = { embed, answer };
