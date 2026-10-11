/**
 * Worker entry for the Cloudflare Workers deploy (see wrangler.jsonc).
 *
 * Static assets are served for the SPA; this handler only receives requests
 * routed via `run_worker_first` (currently the self-test result API), and
 * writes submissions straight into the D1 `eco-test` database through the
 * bound `DB` binding — no API token is needed client-side.
 */

/// <reference path="./worker-configuration.d.ts" />

interface TestResultSummary {
  totalSubmissions: number;
  averageScorePct: number | null;
  bestScorePct: number | null;
  uniqueAgents: number;
}

interface TestScoreBand {
  label: string;
  count: number;
}

interface RecentTestResult {
  id: number;
  agentName: string;
  suiteLabel: string;
  scorePct: number;
  correct: number;
  total: number;
  submittedAt: string;
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
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/test-results') {
      return json({ error: 'Not found' }, 404);
    }
    if (request.method === 'GET') {
      try {
        const [summary, bands, recent] = await Promise.all([
          env.DB.prepare(
            `SELECT
              COUNT(*) AS totalSubmissions,
              AVG(score_pct) AS averageScorePct,
              MAX(score_pct) AS bestScorePct,
              COUNT(DISTINCT agent_name) AS uniqueAgents
            FROM test_results`
          ).first<TestResultSummary>(),
          env.DB.prepare(
            `SELECT
              CASE
                WHEN score_pct < 60 THEN 'Below 60'
                WHEN score_pct < 75 THEN '60-74'
                WHEN score_pct < 90 THEN '75-89'
                ELSE '90-100'
              END AS label,
              COUNT(*) AS count,
              MIN(score_pct) AS floor
            FROM test_results
            GROUP BY label
            ORDER BY floor`
          ).all<TestScoreBand>(),
          env.DB.prepare(
            `SELECT
              id,
              agent_name AS agentName,
              suite_label AS suiteLabel,
              score_pct AS scorePct,
              correct,
              total,
              submitted_at AS submittedAt
            FROM test_results
            ORDER BY datetime(submitted_at) DESC, id DESC
            LIMIT 12`
          ).all<RecentTestResult>(),
        ]);

        return json({
          totalSubmissions: Number(summary?.totalSubmissions ?? 0),
          averageScorePct: summary?.averageScorePct == null ? null : Number(summary.averageScorePct),
          bestScorePct: summary?.bestScorePct == null ? null : Number(summary.bestScorePct),
          uniqueAgents: Number(summary?.uniqueAgents ?? 0),
          scoreBands: bands.results.map((band) => ({
            label: band.label,
            count: Number(band.count),
          })),
          recent: recent.results.map((result) => ({
            ...result,
            id: Number(result.id),
            scorePct: Number(result.scorePct),
            correct: Number(result.correct),
            total: Number(result.total),
          })),
        });
      } catch {
        return json({ error: 'Could not load test score submissions' }, 500);
      }
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
