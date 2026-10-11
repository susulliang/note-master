import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { alertContentAsMarkdown, type KeywordAlert } from '@/lib/keyword-alerts';

export default function KeywordAlertContent({ alert }: { alert: KeywordAlert }) {
  return (
    <div className="prose prose-xs max-w-none break-words text-[11px] leading-relaxed text-foreground/90 prose-headings:my-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{alertContentAsMarkdown(alert)}</ReactMarkdown>
    </div>
  );
}
