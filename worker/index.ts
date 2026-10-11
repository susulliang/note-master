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

interface KeywordAlertRow {
  id: string;
  keyword: string;
  alert: string;
  format: 'markdown' | 'html';
  sortOrder: number;
}

interface KeywordAlertPayload {
  password?: unknown;
  alerts?: unknown;
}

interface PasswordVerifier {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function parsePasswordVerifier(value: string | undefined): PasswordVerifier | null {
  if (!value) return null;
  const [scheme, rounds, saltText, hashText] = value.split('$');
  const iterations = Number(rounds);
  const salt = saltText ? decodeBase64(saltText) : null;
  const hash = hashText ? decodeBase64(hashText) : null;
  if (
    scheme !== 'pbkdf2-sha256' ||
    !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 ||
    !salt || salt.length < 16 ||
    !hash || hash.length !== 32
  ) return null;
  return { iterations, salt, hash };
}

async function verifyAdminPassword(password: string, verifier: PasswordVerifier): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: verifier.salt.buffer.slice(
        verifier.salt.byteOffset,
        verifier.salt.byteOffset + verifier.salt.byteLength,
      ) as ArrayBuffer,
      iterations: verifier.iterations,
    },
    key,
    verifier.hash.length * 8,
  );
  const candidate = new Uint8Array(bits);
  let mismatch = 0;
  for (let index = 0; index < verifier.hash.length; index += 1) {
    mismatch |= candidate[index]! ^ verifier.hash[index]!;
  }
  return mismatch === 0;
}

async function hashRemoteAddress(address: string, verifier: PasswordVerifier): Promise<string> {
  const keyBytes = verifier.hash.buffer.slice(
    verifier.hash.byteOffset,
    verifier.hash.byteOffset + verifier.hash.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address)),
  );
  return btoa(Array.from(signature, (byte) => String.fromCharCode(byte)).join(''));
}

function parseKeywordAlerts(value: unknown): KeywordAlertRow[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = new Set<string>();
  const rows: KeywordAlertRow[] = [];
  for (const [sortOrder, item] of value.entries()) {
    if (!item || typeof item !== 'object') return null;
    const alert = item as Record<string, unknown>;
    if (
      typeof alert.id !== 'string' || !alert.id.trim() || alert.id.length > 100 ||
      ids.has(alert.id) ||
      typeof alert.keyword !== 'string' || !alert.keyword.trim() || alert.keyword.length > 200 ||
      typeof alert.alert !== 'string' || !alert.alert.trim() || alert.alert.length > 10_000 ||
      (alert.format !== 'markdown' && alert.format !== 'html')
    ) return null;
    ids.add(alert.id);
    rows.push({
      id: alert.id.trim(),
      keyword: alert.keyword.trim(),
      alert: alert.alert,
      format: alert.format,
      sortOrder,
    });
  }
  return rows;
}

async function handleKeywordAlerts(
  request: Request,
  env: Env & { ALERT_ADMIN_PASSWORD_HASH?: string },
): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const result = await env.DB.prepare(
        `SELECT id, keyword, alert, content_format AS format, sort_order AS sortOrder
         FROM keyword_alerts ORDER BY sort_order, id`
      ).all<KeywordAlertRow>();
      return json({ alerts: result.results.map((row) => ({ ...row, sortOrder: Number(row.sortOrder) })) });
    } catch {
      return json({ error: 'Could not load keyword alerts' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 256_000) return json({ error: 'Request is too large' }, 413);

  let payload: KeywordAlertPayload;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 256_000) {
      return json({ error: 'Request is too large' }, 413);
    }
    payload = JSON.parse(body) as KeywordAlertPayload;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (
    typeof payload.password !== 'string' || payload.password.length < 1 || payload.password.length > 256
  ) return json({ error: 'Password required' }, 400);
  const alerts = parseKeywordAlerts(payload.alerts);
  if (!alerts) return json({ error: 'Invalid keyword alert list' }, 400);

  const verifier = parsePasswordVerifier(env.ALERT_ADMIN_PASSWORD_HASH);
  if (!verifier) return json({ error: 'Alert management is not configured' }, 503);
  const remoteAddress = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const remoteHash = await hashRemoteAddress(remoteAddress, verifier);
  const now = Math.floor(Date.now() / 1000);
  const attempt = await env.DB.prepare(
    'SELECT window_started AS windowStarted, failures FROM keyword_alert_login_attempts WHERE ip_hash = ?'
  ).bind(remoteHash).first<{ windowStarted: number; failures: number }>();
  if (
    attempt &&
    now - Number(attempt.windowStarted) < 900 &&
    Number(attempt.failures) >= 10
  ) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  if (!(await verifyAdminPassword(payload.password, verifier))) {
    await env.DB.prepare(
      `INSERT INTO keyword_alert_login_attempts (ip_hash, window_started, failures)
       VALUES (?, ?, 1)
       ON CONFLICT(ip_hash) DO UPDATE SET
         window_started = CASE
           WHEN excluded.window_started - keyword_alert_login_attempts.window_started >= 900
           THEN excluded.window_started ELSE keyword_alert_login_attempts.window_started END,
         failures = CASE
           WHEN excluded.window_started - keyword_alert_login_attempts.window_started >= 900
           THEN 1 ELSE keyword_alert_login_attempts.failures + 1 END`
    ).bind(remoteHash, now).run();
    return json({ error: 'Incorrect password' }, 401);
  }

  try {
    await env.DB.prepare(
      'DELETE FROM keyword_alert_login_attempts WHERE ip_hash = ?'
    ).bind(remoteHash).run();
    const statements = [
      env.DB.prepare('DELETE FROM keyword_alerts'),
      ...alerts.map((alert) =>
        env.DB.prepare(
          `INSERT INTO keyword_alerts (id, keyword, alert, content_format, sort_order)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(alert.id, alert.keyword, alert.alert, alert.format, alert.sortOrder)
      ),
    ];
    const results = await env.DB.batch(statements);
    if (results.some((result) => !result.success)) {
      return json({ error: 'Could not save keyword alerts' }, 500);
    }
    return json({ success: true, count: alerts.length });
  } catch {
    return json({ error: 'Could not save keyword alerts' }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/keyword-alerts') {
      return handleKeywordAlerts(request, env);
    }
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
