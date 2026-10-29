# Document Q&A with Citations

Upload PDFs, ask questions about one document or all of yours, and get AI answers that cite **document name and page**. Click a citation to see the source text.

## Stack
Node.js + Express (API) · SQLite via better-sqlite3 (database) · JWT + bcrypt (auth) · Gemini API (embeddings + answers) · vanilla JS responsive frontend.

## Setup
```bash
npm install
cp .env.example .env     # then set the variables below in your shell (Windows: set GEMINI_API_KEY=...)
npm run seed             # creates demo user + sample document
npm start                # http://localhost:3000
npm test                 # 13 automated tests
```
Required settings are listed in `.env.example` (`GEMINI_API_KEY`, `JWT_SECRET`). The server reads environment variables; it does not load `.env` automatically.

**Demo login:** `demo@example.com` / `demo12345` (sample "Acme Handbook" document included).

## Data model
- `users(id, email, password_hash)`
- `documents(id, user_id → users, name, status[processing|ready|error], error, pages)`
- `chunks(id, document_id → documents, page, text, embedding JSON)`
Deleting a user or document cascades to its chunks.

## Design decisions
- **Page-aware chunking:** text is split per page into ~1000-char overlapping chunks, so each chunk carries its page number and every citation is exact.
- **Embeddings + cosine similarity:** chunk embeddings are stored in SQLite; a question is embedded and the top 6 chunks are retrieved. If embeddings are unavailable, ranking falls back to keyword overlap so the app keeps working.
- **Authorization on the server:** every query joins `documents` and filters on `user_id` from the verified JWT, never from client input. Asking about someone else's document returns 404 (tested).
- **Background processing:** `POST /api/documents` returns `202` immediately; parsing and embedding run afterwards. The UI shows "processing" and polls until "ready" or "error".
- **Grounded answers:** the model sees numbered sources `[S1]…`, must cite them, and must say so when the sources don't contain the answer. The server returns the sources so the UI can show cited text.
- **Validation:** email/password rules, PDF magic-byte check, 20 MB limit, question length, and integer doc ids are all checked on the server; errors surface in the UI.

## Status
**Done:** auth, upload, background processing, embeddings search, single/all-document questions, citations with name + page and source text, validation, responsive UI, seed data, tests.
**Not done / with more time:** a job queue (currently in-process, lost if the server restarts mid-processing), OCR for scanned PDFs, a vector index for very large libraries (currently brute-force cosine in memory), chat history per document, highlighting the cited passage in a PDF viewer, rate limiting, deployment.

## AI tools used
- **Claude** (Anthropic) helped generate the initial code, tests and this README; I reviewed and ran all of it.
- **Gemini API** is used at runtime for embeddings and for answering questions.
