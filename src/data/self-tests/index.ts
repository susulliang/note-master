import type { SelfTestProgress, SuiteProgress, TestSuite } from './types';
import { suitesPart1 } from './suites-part1';
import { suitesPart2 } from './suites-part2';
import { suitesPart3 } from './suites-part3';
import { suitesPart4 } from './suites-part4';
import { suitesPart5 } from './suites-part5';
import { suitesPart6 } from './suites-part6';
import { suitesPart7 } from './suites-part7';

export type { QuizQuestion, ArticleQuiz, TestSuite, SuiteProgress, SelfTestProgress } from './types';

export const SELF_TEST_SUITES: TestSuite[] = [
  ...suitesPart1,
  ...suitesPart2,
  ...suitesPart3,
  ...suitesPart4,
  ...suitesPart5,
  ...suitesPart6,
  ...suitesPart7,
];

export const MAX_ATTEMPTS_PER_SUITE = 2;

export function suiteQuestionCount(suite: TestSuite): number {
  return suite.articles.reduce((sum, a) => sum + a.questions.length, 0);
}

const STORAGE_KEY = '__app_ecovacs_self_test_v1';

export function loadSelfTestProgress(): SelfTestProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SelfTestProgress;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSuiteResult(suiteId: string, score: number, total: number): SelfTestProgress {
  const progress = loadSelfTestProgress();
  const prev: SuiteProgress = progress[suiteId] ?? { attempts: 0, scores: [], lastDate: '' };
  const next: SuiteProgress = {
    attempts: prev.attempts + 1,
    scores: [...prev.scores, total > 0 ? Math.round((score / total) * 100) : 0],
    lastDate: new Date().toISOString(),
  };
  progress[suiteId] = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // storage full / unavailable — progress stays in memory only
  }
  return progress;
}
