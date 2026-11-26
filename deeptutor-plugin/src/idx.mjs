/**
 * BM25 text indexer — pure JS, no external deps.
 *
 * Tokenization:
 *   - CJK characters (Chinese/Japanese/Korean) are split into overlapping 2-grams.
 *   - English/Latin text is split on non-alpha characters.
 *
 * Index format (inverted index JSON):
 *   {
 *     "terms": { "<term>": { "<docId>": { "positions": [], "count": N } } },
 *     "docs": { "<docId>": { "path": "...", "length": N } },
 *     "numDocs": N,
 *     "avgDL": N
 *   }
 */

const K1 = 1.5;
const B  = 0.75;

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * Split text into an array of token strings.
 * CJK chars → overlapping 2-grams. Everything else → lowercased alpha tokens.
 */
export function tokenize(text) {
  if (typeof text !== 'string') return [];
  text = text.trim();
  if (!text) return [];

  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    if (isCJK(ch)) {
      const runStart = i;
      while (i < text.length && isCJK(String.fromCodePoint(text.codePointAt(i)))) {
        i += String.fromCodePoint(text.codePointAt(i)).length;
      }
      const run = text.slice(runStart, i);
      for (let j = 0; j + 1 < run.length; j++) {
        tokens.push(run.slice(j, j + 2));
      }
      for (let j = 0; j < run.length; j++) {
        tokens.push(run[j]);
      }
    } else {
      const runStart = i;
      while (i < text.length && /[a-zA-Z]/.test(String.fromCodePoint(text.codePointAt(i)))) {
        i += String.fromCodePoint(text.codePointAt(i)).length;
      }
      if (i > runStart) {
        tokens.push(text.slice(runStart, i).toLowerCase());
      } else {
        i++;
      }
    }
  }
  return tokens;
}

/** Quick heuristic: is this character CJK-related? */
function isCJK(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x4e00 && cp <= 0x9fff) return true;
  if (cp >= 0x3400 && cp <= 0x4dbf) return true;
  if (cp >= 0x20000 && cp <= 0x2a6df) return true;
  if (cp >= 0x2a700 && cp <= 0x2b73f) return true;
  if (cp >= 0x2b740 && cp <= 0x2b81f) return true;
  if (cp >= 0x2b820 && cp <= 0x2ceaf) return true;
  if (cp >= 0xf900 && cp <= 0xfaff) return true;
  if (cp >= 0x3040 && cp <= 0x309f) return true;
  if (cp >= 0x30a0 && cp <= 0x30ff) return true;
  if (cp >= 0xac00 && cp <= 0xd7af) return true;
  if (cp >= 0xff00 && cp <= 0xffef) return true;
  return false;
}

// ---------------------------------------------------------------------------
// buildIndex
// ---------------------------------------------------------------------------

/**
 * Build an inverted index from an array of documents.
 * @param {{path: string, content: string}[]} docs
 * @returns {object} index JSON
 */
export function buildIndex(docs) {
  const terms = Object.create(null);
  const docMeta = Object.create(null);
  let totalDocLength = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const docId = String(i);
    const tokens = tokenize(doc.content);
    const length = tokens.length;
    totalDocLength += length;
    docMeta[docId] = { path: doc.path, length };

    const seen = Object.create(null);
    const firstPos = Object.create(null);
    for (let j = 0; j < tokens.length; j++) {
      const t = tokens[j];
      seen[t] = (seen[t] || 0) + 1;
      if (firstPos[t] === undefined) firstPos[t] = j;
    }

    for (const [term, count] of Object.entries(seen)) {
      if (!terms[term]) terms[term] = Object.create(null);
      terms[term][docId] = { count, position: firstPos[term] };
    }
  }

  const numDocs = docs.length;
  const avgDL = numDocs > 0 ? totalDocLength / numDocs : 0;

  return { terms, docs: docMeta, numDocs, avgDL };
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

/**
 * Search the index for a query, returning up to `k` results scored via BM25.
 * @param {object} index  – output of buildIndex (may have _rawDocs attached)
 * @param {string} query
 * @param {number} k      – max results (default 5)
 * @returns {{file:string, score:number, snippet:string, offset:number}[]}
 */
export function search(index, query, k = 5) {
  if (!index || !index.terms) return [];
  const queryTokens = tokenize(query);
  const numDocs = index.numDocs || 1;
  const avgDL = index.avgDL || 1;

  const scores = Object.create(null);

  for (const token of queryTokens) {
    const postings = index.terms[token];
    if (!postings) continue;
    for (const [docId, info] of Object.entries(postings)) {
      const dl = index.docs[docId]?.length ?? 0;
      const tf = info.count;
      const idf = Math.log(1 + (numDocs - info.count + 0.5) / (info.count + 0.5));
      const bf = (K1 + 1) * tf / (K1 * (1 - B + B * dl / avgDL) + tf);
      scores[docId] = (scores[docId] || 0) + idf * bf;
    }
  }

  // No baseline for non-matching docs: an empty hit set means an empty result
  // list — unrelated documents must never surface as "evidence".

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const results = [];
  const maxResults = Math.min(k, entries.length);

  for (let i = 0; i < maxResults; i++) {
    const docId = entries[i][0];
    const meta = index.docs[docId];
    if (!meta) continue;

    const rawContent = index._rawDocs?.[docId] ?? '';
    const snippet = makeSnippet(rawContent, queryTokens, 120);

    results.push({
      file: meta.path,
      score: Number(entries[i][1].toFixed(6)),
      snippet: snippet.text,
      offset: snippet.offset,
    });
  }
  return results;
}

function makeSnippet(content, queryTokens, maxLength) {
  if (!content) return { text: '', offset: 0 };
  let bestOffset = 0;
  let bestScore = -1;
  const lowerContent = content.toLowerCase();

  for (const qToken of queryTokens) {
    const qLower = qToken.toLowerCase();
    let pos = lowerContent.indexOf(qLower);
    while (pos !== -1) {
      const start = Math.max(0, pos - Math.floor(maxLength / 2));
      const end = Math.min(content.length, start + maxLength);
      const win = content.slice(start, end);
      let matchCount = 0;
      for (const qt of queryTokens) {
        if (win.toLowerCase().includes(qt.toLowerCase())) matchCount++;
      }
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestOffset = start;
      }
      pos = lowerContent.indexOf(qLower, pos + 1);
    }
  }

  const start = Math.max(0, bestOffset - 20);
  const end = Math.min(content.length, bestOffset + maxLength);
  let snippetText = content.slice(start, end);
  if (start > 0) snippetText = '…' + snippetText;
  if (end < content.length) snippetText += '…';

  return { text: snippetText, offset: start };
}

/** Allow callers to attach raw doc contents for snippet extraction. */
export function attachRawDocs(index, docs) {
  index._rawDocs = Object.create(null);
  for (let i = 0; i < docs.length; i++) {
    index._rawDocs[String(i)] = docs[i].content;
  }
}
