export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** Index of the correct option. */
  answerIndex: number;
  /** Short explanation shown after answering. */
  explanation: string;
  /** Where the knowledge came from (article date · group). */
  source: string;
}

export interface ArticleQuiz {
  article: string;
  date: string;
  questions: QuizQuestion[];
}

export interface TestSuite {
  id: string;
  label: string;
  range: string;
  articles: ArticleQuiz[];
}

export interface SuiteProgress {
  attempts: number;
  scores: number[];
  lastDate: string;
}

export type SelfTestProgress = Record<string, SuiteProgress>;
