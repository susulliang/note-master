/**
 * Worker entry for the Cloudflare Workers deploy (see wrangler.jsonc).
 *
 * Static assets are served for the SPA; this handler only receives requests
 * routed via `run_worker_first` (currently the self-test result API), and
 * writes submissions straight into the D1 `eco-test` database through the
 * bound `DB` binding — no API token is needed client-side.
 */

interface D1RunResult {
  success: boolean;
  meta: { last_row_id?: number };
}

interface D1Database {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<D1RunResult> };
  };
}

interface Env {
  DB: D1Database;
}

interface TestResultPayload {
  agentName?: unknown;
  suiteId?: unknown;
  suiteLabel?: unknown;
  scorePct?: unknown;
  correct?: unknown;
  total?: unknown;
  report?: unknown;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/test-results') {
      return json({ error: 'Not found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let payload: TestResultPayload;
    try {
      payload = (await request.json()) as TestResultPayload;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { agentName, suiteId, suiteLabel, scorePct, correct, total, report } = payload;
    if (
      typeof agentName !== 'string' || !agentName.trim() ||
      typeof suiteId !== 'string' || !suiteId.trim() ||
      typeof suiteLabel !== 'string' || !suiteLabel.trim() ||
      typeof scorePct !== 'number' || !Number.isFinite(scorePct) ||
      typeof correct !== 'number' ||
      typeof total !== 'number' ||
      typeof report !== 'string' || !report.trim()
    ) {
      return json({ error: 'Missing or invalid required fields' }, 400);
    }

    try {
      const result = await env.DB.prepare(
        'INSERT INTO test_results (agent_name, suite_id, suite_label, score_pct, correct, total, report) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          agentName.trim(),
          suiteId.trim(),
          suiteLabel.trim(),
          scorePct,
          Math.trunc(correct),
          Math.trunc(total),
          report
        )
        .run();
      if (!result.success) {
        return json({ error: 'D1 insert failed' }, 500);
      }
      return json({ success: true, id: result.meta.last_row_id ?? null });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'D1 insert error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
