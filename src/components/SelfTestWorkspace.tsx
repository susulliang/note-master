import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCopy,
  GraduationCap,
  Lock,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  loadSelfTestProgress,
  MAX_ATTEMPTS_PER_SUITE,
  saveSuiteResult,
  SELF_TEST_SUITES,
  suiteQuestionCount,
  type SelfTestProgress,
  type QuizQuestion,
  type TestSuite,
} from '@/data/self-tests';
import { loadNewsIndex, type NewsItem } from '@/utils/newsData';

type Phase = 'menu' | 'name' | 'quiz' | 'result';
type SubmitState = 'idle' | 'submitting' | 'ok' | 'error';

interface SelfTestWorkspaceProps {
  onCatThought?: (text: string, ttl?: number) => void;
  onCatMoveTo?: (position: { x: number; y: number }) => void;
}

interface AnswerRecord {
  question: QuizQuestion;
  selected: number;
  correct: boolean;
}

/** Self-test score submission — handled by the Workers D1 proxy (see worker/index.ts). */
const TEST_RESULTS_ENDPOINT = '/api/test-results';

const HINT_DELAY_MS = 15_000;
const CORRECT_STAY_MS = 3_000;
const WRONG_STAY_MS = 6_000;
let answerAudioContext: AudioContext | null = null;

function playAnswerTone(correct: boolean) {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  try {
    answerAudioContext ??= new window.AudioContext();
    const context = answerAudioContext;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const start = context.currentTime + 0.02;
    const notes = correct
      ? [{ frequency: 587.33, offset: 0, duration: 0.12 }, { frequency: 783.99, offset: 0.1, duration: 0.2 }]
      : [{ frequency: 329.63, offset: 0, duration: 0.1 }, { frequency: 261.63, offset: 0.15, duration: 0.16 }];

    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const beginsAt = start + note.offset;
      const endsAt = beginsAt + note.duration;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, beginsAt);
      gain.gain.setValueAtTime(0.0001, beginsAt);
      gain.gain.exponentialRampToValueAtTime(0.07, beginsAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(beginsAt);
      oscillator.stop(endsAt);
    }
  } catch {
    // Audio feedback is optional when the browser blocks audio output.
  }
}

const CAT_CHEERS = [
  'Purr-fect! 🎉',
  'Meow-wow, nailed it! 🐾',
  'Whisker-lickin\' good!',
  'The cat approves. 😼',
  'Bullseye! 🔥',
  'Smart human! ✨',
  'Pawsome work!',
  'Ten out of ten toe beans! 🐱',
];

const CAT_CONSOLES = [
  'Oof — the cat still loves you. 💛',
  'Almost! Remember this one. 🐾',
  'Even cats miss a jump sometimes.',
  'Note it down — next one is yours!',
  'Hiss… just kidding, keep going!',
  'Wrong but wiser now. 💪',
  'The robot vacuum ate that answer, huh?',
];

const LETTERS = ['A', 'B', 'C', 'D'];
const ARTICLE_TITLE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'issue', 'update', 'series', 'faq',
  'new', 'why', 'does', 'after', 'clarification', 'causes', 'solution',
]);

function normalizeArticleTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function articleTitleTokens(value: string): Set<string> {
  const tokens: string[] = value.normalize('NFKC').toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(tokens.filter((token) =>
    token.length > 2 && !ARTICLE_TITLE_STOP_WORDS.has(token)
  ));
}

function truncateArticleExcerpt(value: string): string {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim());
  return chars.length > 100 ? `${chars.slice(0, 99).join('')}…` : chars.join('');
}

function findArticleExcerpt(title: string, items: NewsItem[]): string {
  const titleKey = normalizeArticleTitle(title);
  const exact = items.find((item) => normalizeArticleTitle(item.title) === titleKey);
  const targetTokens = articleTitleTokens(title);
  const source = exact ?? items
    .map((item) => {
      const tokens = articleTitleTokens(item.title);
      const overlap = [...targetTokens].filter((token) => tokens.has(token)).length;
      return { item, score: targetTokens.size ? overlap / targetTokens.size : 0 };
    })
    .filter((candidate) => candidate.score >= 0.7)
    .sort((a, b) => b.score - a.score)[0]?.item;
  if (!source) return '';

  const firstPostText = source.bodyLines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('>') && !line.startsWith('#'))
    .map((line) => line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/^[-*+]\s+/, '')
      .trim())
    .find(Boolean) ?? '';
  return truncateArticleExcerpt(firstPostText);
}

/** Rotating candy palette for the suite cards + option buttons. */
const SUITE_COLORS = [
  { ring: 'hover:border-violet-400', badge: 'border-violet-400/50 bg-violet-400/15 text-violet-200', glow: 'group-hover:shadow-[0_0_20px_-6px_rgba(167,139,250,0.6)]' },
  { ring: 'hover:border-sky-400', badge: 'border-sky-400/50 bg-sky-400/15 text-sky-200', glow: 'group-hover:shadow-[0_0_20px_-6px_rgba(56,189,248,0.6)]' },
  { ring: 'hover:border-emerald-400', badge: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200', glow: 'group-hover:shadow-[0_0_20px_-6px_rgba(52,211,153,0.6)]' },
  { ring: 'hover:border-amber-400', badge: 'border-amber-400/50 bg-amber-400/15 text-amber-200', glow: 'group-hover:shadow-[0_0_20px_-6px_rgba(251,191,36,0.6)]' },
  { ring: 'hover:border-rose-400', badge: 'border-rose-400/50 bg-rose-400/15 text-rose-200', glow: 'group-hover:shadow-[0_0_20px_-6px_rgba(251,113,133,0.6)]' },
];

const OPTION_COLORS = [
  'border-violet-400/40 bg-violet-400/10 hover:border-violet-300 hover:bg-violet-400/20',
  'border-sky-400/40 bg-sky-400/10 hover:border-sky-300 hover:bg-sky-400/20',
  'border-amber-400/40 bg-amber-400/10 hover:border-amber-300 hover:bg-amber-400/20',
  'border-emerald-400/40 bg-emerald-400/10 hover:border-emerald-300 hover:bg-emerald-400/20',
];

const OPTION_LETTER_COLORS = [
  'border-violet-400/60 bg-violet-400/20 text-violet-200',
  'border-sky-400/60 bg-sky-400/20 text-sky-200',
  'border-amber-400/60 bg-amber-400/20 text-amber-200',
  'border-emerald-400/60 bg-emerald-400/20 text-emerald-200',
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Fisher–Yates shuffle of a question's options — remaps answerIndex to match. */
function shuffleQuestion(q: QuizQuestion): QuizQuestion {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    answerIndex: order.indexOf(q.answerIndex),
  };
}

function buildReport(suite: TestSuite, agent: string, answers: AnswerRecord[], scorePct: number): string {
  const lines: string[] = [];
  lines.push(`Self Test — ${suite.label} (${suite.range})`);
  lines.push(`Agent: ${agent}`);
  const correct = answers.filter((a) => a.correct).length;
  lines.push(`Score: ${correct}/${answers.length} (${scorePct}%)`);
  lines.push('');
  answers.forEach((rec, i) => {
    lines.push(`Q${i + 1}. ${rec.question.prompt}`);
    lines.push(`   Your answer: ${LETTERS[rec.selected] ?? '?'} — ${rec.question.options[rec.selected] ?? '?'} ${rec.correct ? '✓' : '✗'}`);
    if (!rec.correct) {
      lines.push(`   Correct answer: ${LETTERS[rec.question.answerIndex]} — ${rec.question.options[rec.question.answerIndex]}`);
    }
  });
  return lines.join('\n');
}

/** One confetti/firework burst — particles fly out from the card center. */
function FireworkBurst() {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 90 + Math.random() * 130;
        const colors = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#f472b6'];
        return {
          tx: `${Math.cos(angle) * dist}px`,
          ty: `${Math.sin(angle) * dist}px`,
          color: colors[i % colors.length],
          size: 6 + Math.random() * 6,
          delay: `${Math.random() * 0.12}s`,
        };
      }),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/3 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 10px ${p.color}`,
            animation: `selftest-burst 0.9s cubic-bezier(0.16, 0.84, 0.44, 1) ${p.delay} forwards`,
            ['--tx' as string]: p.tx,
            ['--ty' as string]: p.ty,
          }}
        />
      ))}
      <style>{`@keyframes selftest-burst { 0% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.15); opacity: 0; } }`}</style>
    </div>
  );
}

export default function SelfTestWorkspace({ onCatThought, onCatMoveTo }: SelfTestWorkspaceProps) {
  const [progress, setProgress] = useState<SelfTestProgress>(() => loadSelfTestProgress());
  const [phase, setPhase] = useState<Phase>('menu');
  const [activeSuite, setActiveSuite] = useState<TestSuite | null>(null);
  const [agentName, setAgentName] = useState('');
  const [currentArticleExcerpt, setCurrentArticleExcerpt] = useState('');
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [locked, setLocked] = useState(false);
  const [fireworkKey, setFireworkKey] = useState(0);
  const [hintActive, setHintActive] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const moveCatTo = useCallback((target: Element | null) => {
    if (!target || !onCatMoveTo) return;
    const bounds = target.getBoundingClientRect();
    onCatMoveTo({
      x: Math.min(bounds.right + 12, window.innerWidth - 140),
      y: bounds.top + bounds.height / 2 - 64,
    });
  }, [onCatMoveTo]);

  /** Flat {question, article} list for the active suite. */
  const quizItems = useMemo(() => {
    if (!activeSuite) return [];
    return activeSuite.articles.flatMap((a) => a.questions.map((q) => ({ q, article: a.article })));
  }, [activeSuite]);

  /** Quiz run copy — options freshly shuffled each attempt. */
  const [shuffledItems, setShuffledItems] = useState<{ q: QuizQuestion; article: string }[]>([]);

  const current = shuffledItems[qIndex]?.q;
  const currentArticle = shuffledItems[qIndex]?.article ?? '';
  const scorePct = answers.length > 0 ? Math.round((answers.filter((a) => a.correct).length / answers.length) * 100) : 0;

  useEffect(() => {
    if (!currentArticle) {
      setCurrentArticleExcerpt('');
      return;
    }
    let alive = true;
    setCurrentArticleExcerpt('');
    loadNewsIndex()
      .then((items) => {
        if (alive) setCurrentArticleExcerpt(findArticleExcerpt(currentArticle, items));
      })
      .catch(() => {
        if (alive) setCurrentArticleExcerpt('');
      });
    return () => {
      alive = false;
    };
  }, [currentArticle]);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  useEffect(() => clearAdvanceTimer, [clearAdvanceTimer]);

  /** 15s reading timer — the shared cat assistant offers one hint per test. */
  useEffect(() => {
    if (phase !== 'quiz' || locked || hintUsed) return;
    const t = setTimeout(() => {
      setHintUsed(true);
      setHintActive(true);
      onCatThought?.('Psst… I found the right answer for you. 🐾', 8000);
      requestAnimationFrame(() => {
        moveCatTo(workspaceRef.current?.querySelector('[data-selftest-correct="true"]') ?? null);
      });
    }, HINT_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, qIndex, locked, hintUsed, onCatThought, moveCatTo]);

  /** Submit the full report to D1 when the test finishes. */
  const submitResult = useCallback(async (suite: TestSuite, name: string, ans: AnswerRecord[]) => {
    const correct = ans.filter((a) => a.correct).length;
    const pct = ans.length > 0 ? Math.round((correct / ans.length) * 100) : 0;
    setSubmitState('submitting');
    try {
      const res = await fetch(TEST_RESULTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: name,
          suiteId: suite.id,
          suiteLabel: `${suite.label} (${suite.range})`,
          scorePct: pct,
          correct,
          total: ans.length,
          report: buildReport(suite, name, ans, pct),
        }),
      });
      const data = (await res.json()) as { success?: boolean };
      if (!res.ok || !data.success) throw new Error(`Submission failed (${res.status})`);
      setSubmitState('ok');
    } catch {
      setSubmitState('error');
    }
  }, []);

  const openNameEntry = useCallback(
    (suite: TestSuite) => {
      const used = progress[suite.id]?.attempts ?? 0;
      if (used >= MAX_ATTEMPTS_PER_SUITE) return;
      setActiveSuite(suite);
      setAgentName('');
      setPhase('name');
      onCatThought?.(`Ready for ${suite.label}? Let’s do this! 🎯`, 5000);
      requestAnimationFrame(() => {
        moveCatTo(workspaceRef.current?.querySelector('[data-selftest-name-card]') ?? null);
      });
    },
    [progress, onCatThought, moveCatTo]
  );

  const startQuiz = useCallback(() => {
    if (!agentName.trim() || !activeSuite) return;
    setShuffledItems(
      activeSuite.articles.flatMap((a) => a.questions.map((q) => ({ q: shuffleQuestion(q), article: a.article })))
    );
    setQIndex(0);
    setSelected(null);
    setAnswers([]);
    setLocked(false);
    setHintActive(false);
    setHintUsed(false);
    setSubmitState('idle');
    setPhase('quiz');
  }, [agentName, activeSuite]);

  /** Click an option → instant verdict → timed auto-advance. */
  const handleSelect = useCallback(
    (i: number) => {
      if (locked || !current || !activeSuite) return;
      setSelected(i);
      const correct = i === current.answerIndex;
      playAnswerTone(correct);
      setAnswers((prev) => [...prev, { question: current, selected: i, correct }]);
      setLocked(true);
      setHintActive(false);
      if (correct) {
        setFireworkKey((k) => k + 1);
        onCatThought?.(pickRandom(CAT_CHEERS), 4500);
      } else {
        onCatThought?.(pickRandom(CAT_CONSOLES), 6000);
      }
      requestAnimationFrame(() => {
        moveCatTo(workspaceRef.current?.querySelector('[data-selftest-verdict]') ?? null);
      });
      const isLast = qIndex + 1 >= quizItems.length;
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        if (isLast) {
          setProgress(saveSuiteResult(activeSuite.id, answers.filter((a) => a.correct).length, quizItems.length));
          setPhase('result');
          setCopied(false);
          void submitResult(activeSuite, agentName.trim(), answers);
        } else {
          setQIndex((n) => n + 1);
          setSelected(null);
          setLocked(false);
        }
      }, correct ? CORRECT_STAY_MS : WRONG_STAY_MS);
    },
    [locked, current, activeSuite, qIndex, quizItems.length, answers, agentName, submitResult, onCatThought, moveCatTo]
  );

  const handleCopy = useCallback(async () => {
    if (!activeSuite) return;
    try {
      await navigator.clipboard.writeText(buildReport(activeSuite, agentName.trim(), answers, scorePct));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — textarea is still selectable manually
    }
  }, [activeSuite, agentName, answers, scorePct]);

  const backToMenu = useCallback(() => {
    clearAdvanceTimer();
    setPhase('menu');
    setActiveSuite(null);
    setAnswers([]);
    setLocked(false);
    setHintActive(false);
    setHintUsed(false);
  }, [clearAdvanceTimer]);

  return (
    <div ref={workspaceRef} className="h-full min-h-full w-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* ── Suite selection ─────────────────────────────────────────── */}
        {phase === 'menu' && (
          <>
            <header className="mb-8">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl border-2 border-violet-400/40 bg-violet-400/10 shadow-[0_0_18px_-6px_rgba(167,139,250,0.7)]">
                  <GraduationCap className="size-7 text-violet-300" />
                </div>
                <div>
                  <h1 className="font-mono text-2xl font-extrabold tracking-tight text-foreground">
                    Self Test <span className="text-violet-300">🎯</span>
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Weekly news quizzes — {SELF_TEST_SUITES.length} suites · {MAX_ATTEMPTS_PER_SUITE} attempts each · the cat may help once 😉
                  </p>
                </div>
              </div>
            </header>
            <div className="grid gap-3">
              {SELF_TEST_SUITES.map((suite, idx) => {
                const p = progress[suite.id];
                const attempts = p?.attempts ?? 0;
                const done = attempts >= MAX_ATTEMPTS_PER_SUITE;
                const latest = p?.scores.length ? p.scores[p.scores.length - 1] : null;
                const qCount = suiteQuestionCount(suite);
                const color = SUITE_COLORS[idx % SUITE_COLORS.length];
                return (
                  <button
                    key={suite.id}
                    type="button"
                    disabled={done}
                    onClick={() => openNameEntry(suite)}
                    className={cn(
                      'group flex w-full items-center gap-4 rounded-xl border-2 bg-card/60 px-4 py-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
                      done
                        ? 'border-border opacity-55'
                        : cn('border-border/80 hover:-translate-y-0.5 hover:bg-card', color.ring, color.glow)
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-14 shrink-0 items-center justify-center rounded-xl border-2 font-mono text-base font-extrabold',
                        done ? 'border-border text-muted-foreground' : color.badge
                      )}
                    >
                      {done ? <Lock className="size-5" /> : suite.label.replace('Week ', 'W')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-foreground">{suite.label}</span>
                        <span className="font-mono text-xs text-muted-foreground">{suite.range}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {suite.articles.length} articles · {qCount} questions
                        {attempts > 0 && ` · attempt ${Math.min(attempts, MAX_ATTEMPTS_PER_SUITE)}/${MAX_ATTEMPTS_PER_SUITE}${done ? ' — completed' : ''}`}
                      </div>
                    </div>
                    {latest !== null && (
                      <div
                        className={cn(
                          'shrink-0 rounded-lg border-2 px-3 py-1 font-mono text-base font-extrabold',
                          latest >= 80
                            ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
                            : latest >= 60
                              ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
                              : 'border-rose-400/60 bg-rose-400/15 text-rose-300'
                        )}
                      >
                        {latest}%
                      </div>
                    )}
                    {!done && <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Name entry ──────────────────────────────────────────────── */}
        {phase === 'name' && activeSuite && (
          <div data-selftest-name-card className="relative mx-auto mt-16 max-w-md overflow-visible rounded-2xl border-2 border-violet-400/40 bg-card/70 p-7 shadow-xl">
            <button
              type="button"
              onClick={backToMenu}
              className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <ArrowLeft className="size-4" /> All suites
            </button>
            <div className="flex items-center gap-3">
              <div>
                <h2 className="font-mono text-xl font-extrabold text-foreground">
                  {activeSuite.label} · {activeSuite.range}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {activeSuite.articles.length} articles · {quizItems.length} questions — ready, human?
                </p>
              </div>
            </div>
            <input
              type="text"
              value={agentName}
              autoFocus
              onChange={(e) => setAgentName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && agentName.trim()) startQuiz();
              }}
              placeholder="Type your name…"
              className="mt-5 w-full rounded-xl border-2 border-border bg-background/80 px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/70 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-400/20"
            />
            <button
              type="button"
              disabled={!agentName.trim()}
              onClick={startQuiz}
              className={cn(
                'mt-4 w-full rounded-xl border-b-4 px-4 py-3.5 font-mono text-lg font-extrabold uppercase tracking-wide transition-all duration-200',
                agentName.trim()
                  ? 'border-emerald-600 bg-emerald-500 text-white shadow-[0_0_20px_-4px_rgba(52,211,153,0.7)] hover:brightness-110 active:translate-y-0.5 active:border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
                  : 'cursor-not-allowed border-border bg-muted text-muted-foreground'
              )}
            >
              Start Test ▶
            </button>
          </div>
        )}

        {/* ── Quiz ────────────────────────────────────────────────────── */}
        {phase === 'quiz' && activeSuite && current && (
          <div className="relative mx-auto mt-6 max-w-2xl">
            {/* progress */}
            <div className="mb-5 flex items-center gap-3">
              <button
                type="button"
                onClick={backToMenu}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                title="Abandon attempt"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300 ease-out',
                    answers.length > 0 && answers[answers.length - 1]?.correct ? 'bg-emerald-400' : answers.length > 0 ? 'bg-rose-400' : 'bg-primary'
                  )}
                  style={{ width: `${(answers.length / quizItems.length) * 100}%` }}
                />
              </div>
              <span className="font-mono text-xs font-bold text-muted-foreground">
                {qIndex + 1}/{quizItems.length}
              </span>
            </div>

            <div
              key={current.id}
              className="relative animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-2xl border-2 border-border bg-card/70 p-7 shadow-xl"
            >
              {locked && answers[answers.length - 1]?.correct && <FireworkBurst key={fireworkKey} />}

              <p className="font-mono text-xl font-bold leading-relaxed text-foreground sm:text-2xl">{current.prompt}</p>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground/70">
                From “{currentArticle}” · {current.source}
              </p>
              {currentArticleExcerpt && (
                <p className="mt-1 border-l-2 border-sky-400/40 pl-2 text-xs leading-relaxed text-muted-foreground">
                  {currentArticleExcerpt}
                </p>
              )}

              <div className="mt-6 grid gap-3">
                {current.options.map((opt, i) => {
                  const isSelected = selected === i;
                  const isAnswer = i === current.answerIndex;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={locked}
                      onClick={() => handleSelect(i)}
                      data-selftest-correct={isAnswer ? 'true' : 'false'}
                      className={cn(
                        'relative flex w-full items-start gap-3 rounded-xl border-2 border-b-4 px-4 py-4 text-left text-base font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
                        hintActive && isAnswer && 'ring-2 ring-amber-300/90',
                        !locked && OPTION_COLORS[i % OPTION_COLORS.length],
                        !locked && 'text-foreground hover:-translate-y-0.5 active:translate-y-0.5 active:border-b-2',
                        locked && isAnswer && 'border-emerald-400 bg-emerald-400/20 text-emerald-100 shadow-[0_0_18px_-4px_rgba(52,211,153,0.8)]',
                        locked && isSelected && !isAnswer && 'border-rose-400 bg-rose-400/20 text-rose-100',
                        locked && !isAnswer && !isSelected && 'border-border/50 bg-background/40 text-muted-foreground opacity-70'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg border-2 font-mono text-sm font-extrabold',
                          locked && isAnswer
                            ? 'border-emerald-400 bg-emerald-400 text-white'
                            : locked && isSelected
                              ? 'border-rose-400 bg-rose-400 text-white'
                              : OPTION_LETTER_COLORS[i % OPTION_LETTER_COLORS.length]
                        )}
                      >
                        {locked && isAnswer ? <Check className="size-4" /> : locked && isSelected ? <X className="size-4" /> : LETTERS[i]}
                      </span>
                      <span className="leading-relaxed">{opt}</span>
                    </button>
                  );
                })}
              </div>

              {/* verdict footer */}
              {locked && (
                <div
                  data-selftest-verdict
                  className={cn(
                    'mt-5 rounded-xl border-2 px-4 py-3 text-base font-bold animate-in fade-in slide-in-from-bottom-1 duration-200',
                    answers[answers.length - 1]?.correct
                      ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200'
                      : 'border-rose-400/60 bg-rose-400/10 text-rose-200'
                  )}
                >
                  <span className="mr-1.5">{answers[answers.length - 1]?.correct ? '✅ Correct!' : '❌ Not quite.'}</span>
                  <span className="font-semibold opacity-90">{current.explanation}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────────────── */}
        {phase === 'result' && activeSuite && (
          <div className="relative mx-auto mt-6 max-w-2xl">
            <div className="rounded-2xl border-2 border-border bg-card/70 p-7 shadow-xl">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex size-24 items-center justify-center rounded-full border-4 font-mono text-3xl font-extrabold',
                    scorePct >= 80
                      ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300 shadow-[0_0_28px_-6px_rgba(52,211,153,0.8)]'
                      : scorePct >= 60
                        ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                        : 'border-rose-400 bg-rose-400/10 text-rose-300'
                  )}
                >
                  {scorePct}%
                </div>
                <h2 className="mt-3 font-mono text-xl font-extrabold text-foreground">
                  {activeSuite.label} · {activeSuite.range}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {answers.filter((a) => a.correct).length}/{answers.length} correct — {scorePct >= 80 ? 'Great job! 🎉' : scorePct >= 60 ? 'Solid, review the misses. 👍' : 'Time to reread the news. 📚'}
                </p>
                {/* D1 submission status */}
                <p
                  className={cn(
                    'mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-bold',
                    submitState === 'submitting' && 'border-sky-400/50 bg-sky-400/10 text-sky-300',
                    submitState === 'ok' && 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300',
                    submitState === 'error' && 'border-rose-400/50 bg-rose-400/10 text-rose-300',
                    submitState === 'idle' && 'border-border text-muted-foreground'
                  )}
                >
                  {submitState === 'submitting' && <>☁️ Submitting score…</>}
                  {submitState === 'ok' && <>☁️ Score submitted to eco-test ✓</>}
                  {submitState === 'error' && <>☁️ Submission failed (report still copyable)</>}
                  {submitState === 'idle' && <>☁️ Waiting to submit…</>}
                </p>
              </div>

              <div className="mt-5">
                <label className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Result report (submitted to eco-test · copy for records)
                </label>
                <textarea
                  readOnly
                  value={buildReport(activeSuite, agentName.trim(), answers, scorePct)}
                  rows={12}
                  className="w-full resize-y rounded-xl border-2 border-border bg-background/80 px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-400/20"
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={backToMenu}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border px-4 py-2.5 font-mono text-sm font-bold text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <ArrowLeft className="size-4" /> All suites
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl border-b-4 px-4 py-2.5 font-mono text-sm font-extrabold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
                    copied
                      ? 'border-emerald-600 bg-emerald-500/20 text-emerald-300'
                      : 'border-sky-600 bg-sky-500 text-white hover:brightness-110 active:translate-y-0.5 active:border-b-2'
                  )}
                >
                  {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                  {copied ? 'Copied!' : 'Copy Report'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
