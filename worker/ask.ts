/**
 * "Ask the knowledge base" — AI Search (AutoRAG) over the eco-kb R2 bucket,
 * with answer synthesis by the fastest Workers AI chat model (GLM-5.3 Flash,
 * flash-tier MoE — lowest latency of the configured model set).
 *
 * Flow: POST /api/ask { question } → aiSearch retrieval (search RPC as
 * fallback) → one GLM-5.3-Flash call grounded on the chunks → { answer,
 * sources }. The caller (handleAuth) enforces authentication.
 *
 * Binding response shape (vector_store.search_results.page):
 * { search_query, response?, data: [ { file_id, filename: "<r2 key>",
 *   score, content: [ { type, text } ] } ] } — read everything defensively,
 * never enumerate the raw response objects.
 */

/// <reference path="./worker-configuration.d.ts" />

const RAG_INSTANCE = 'supeco';
/** Fastest chat model in the existing WORKERS_AI_MODELS set. */
const ANSWER_MODEL = '@cf/zai-org/glm-5.3-flash';

const CORS_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

interface AutoragContentPart {
  type?: string;
  text?: string;
}
interface AutoragChunk {
  file_id?: string;
  filename?: string;
  score?: number;
  content?: AutoragContentPart[] | string;
  text?: string;
}
interface AutoragBinding {
  aiSearch(args: { query: string; max_results?: number }): Promise<unknown>;
  search(args: { query: string; max_results?: number }): Promise<unknown>;
}

function autoragInstance(env: Env): AutoragBinding | null {
  const ai = env.AI as unknown as { autorag?: (id: string) => AutoragBinding } | undefined;
  if (typeof ai?.autorag !== 'function') return null;
  try {
    return ai.autorag(RAG_INSTANCE);
  } catch {
    return null;
  }
}

function chunkKey(chunk: AutoragChunk): string {
  return chunk.filename ?? chunk.file_id ?? '';
}

function chunkText(chunk: AutoragChunk): string {
  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof chunk.content === 'string') return chunk.content;
  return typeof chunk.text === 'string' ? chunk.text : '';
}

/** Pull the retrieval chunks out of the vector_store.search_results.page. */
function chunksFrom(retrieval: unknown): AutoragChunk[] {
  const record = retrieval as { data?: unknown } | null | undefined;
  const list = Array.isArray(record?.data) ? record.data : [];
  return (list as AutoragChunk[]).filter((c) => chunkText(c).trim().length > 0);
}

function extractReply(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const record = result as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
  if (typeof record.response === 'string') return record.response;
  const content = record.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

const NOT_FOUND_ANSWER =
  "I couldn't find anything about that in the knowledge base yet. Try rephrasing, or ask about Deebot/GOAT models, error codes, app or firmware updates, SOP sections, or AMR templates.";

export async function handleAsk(request: Request, env: Env): Promise<Response> {
  try {
    let question = '';
    try {
      const payload = (await request.json()) as { question?: unknown };
      if (typeof payload.question === 'string') question = payload.question.trim();
    } catch {
      return json({ error: 'Invalid JSON request.' }, 400);
    }
    if (!question) return json({ error: 'Ask a question first.' }, 400);
    if (question.length > 1000) return json({ error: 'Question is too long (max 1000 chars).' }, 400);

    const rag = autoragInstance(env);
    if (!rag) return json({ error: 'AI Search is not configured on the serving Worker.' }, 503);

    // Retrieval — aiSearch's data carries the same retrieval set as the
    // search-only RPC (which has been fatally crashing some isolates).
    let chunks: AutoragChunk[] = [];
    let retrievalError = '';
    try {
      chunks = chunksFrom(await rag.aiSearch({ query: question, max_results: 8 }));
    } catch (e) {
      retrievalError = e instanceof Error ? e.message : String(e);
    }
    if (chunks.length === 0) {
      try {
        chunks = chunksFrom(await rag.search({ query: question, max_results: 8 }));
      } catch (e) {
        retrievalError = `${retrievalError} | ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (chunks.length === 0) {
      if (retrievalError) return json({ error: 'Knowledge base search is temporarily unavailable.', detail: retrievalError }, 503);
      return json({ answer: NOT_FOUND_ANSWER, sources: [] });
    }

    const context = chunks
      .slice(0, 8)
      .map((chunk, index) => `[${index + 1}] ${chunkKey(chunk) || `chunk-${index + 1}`}\n${chunkText(chunk).slice(0, 2500)}`)
      .join('\n\n')
      .slice(0, 60_000);

    const system =
      'You are the Ecovacs North America customer-support knowledge assistant. ' +
      'Answer ONLY from the numbered context excerpts provided. Cite sources inline like [2]. ' +
      'If the excerpts do not contain the answer, say so in one short sentence instead of guessing. ' +
      'Be concise and direct — at most 180 words.';

    const result = await env.AI.run(ANSWER_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Context excerpts:\n\n${context}\n\nQuestion: ${question}` },
      ],
      max_tokens: 700,
      temperature: 0.2,
      stream: false,
    });
    const answer = extractReply(result).trim();
    const seen = new Set<string>();
    const sources: string[] = [];
    for (const chunk of chunks.slice(0, 8)) {
      const key = chunkKey(chunk).replace(/\.md$/, '');
      if (key && !seen.has(key)) {
        seen.add(key);
        sources.push(key);
      }
    }
    return json({ answer: answer || 'The model returned an empty answer — try again.', sources });
  } catch (e) {
    return json({ error: 'Ask pipeline failed — try again in a moment.', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}
