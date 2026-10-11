export type KeywordAlertFormat = 'markdown' | 'html';

export interface KeywordAlert {
  id: string;
  keyword: string;
  alert: string;
  format: KeywordAlertFormat;
}

export const DEFAULT_KEYWORD_ALERTS: KeywordAlert[] = [
  {
    id: 'kw-factory-reset',
    keyword: 'factory reset',
    alert: 'Please remind user that settings and maps will be erased.',
    format: 'markdown',
  },
  {
    id: 'kw-supervisor',
    keyword: 'Supervisor',
    alert:
      'Please kindly and politely inform user that our supervisor is not available and we are able to take any questions and notes.',
    format: 'markdown',
  },
  {
    id: 'kw-amazon',
    keyword: 'Amazon',
    alert:
      'Please verify with user if their purchase is still within the 30-day return window from Amazon',
    format: 'markdown',
  },
];

/**
 * Convert a restricted set of HTML formatting tags to Markdown. Unknown
 * elements are dropped while their text is retained; attributes are ignored.
 */
export function htmlAlertToMarkdown(source: string): string {
  if (typeof DOMParser === 'undefined') return source.replace(/<[^>]*>/g, '');
  const document = new DOMParser().parseFromString(source, 'text/html');
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';

    const content = Array.from(node.childNodes, render).join('');
    switch (node.tagName.toLowerCase()) {
      case 'script':
      case 'style':
      case 'iframe':
      case 'object':
      case 'embed':
      case 'svg':
      case 'math':
      case 'template':
        return '';
      case 'br':
        return '\n';
      case 'p':
      case 'div':
        return `${content}\n\n`;
      case 'strong':
      case 'b':
        return `**${content}**`;
      case 'em':
      case 'i':
        return `*${content}*`;
      case 'code':
        return `\`${content}\``;
      case 'pre':
        return `\n\`\`\`\n${content}\n\`\`\`\n`;
      case 'blockquote':
        return content.split('\n').map((line) => line ? `> ${line}` : line).join('\n');
      case 'ul':
      case 'ol':
        return `${content}\n`;
      case 'li':
        return `- ${content}\n`;
      case 'h1':
      case 'h2':
      case 'h3':
        return `### ${content}\n\n`;
      default:
        return content;
    }
  };

  return Array.from(document.body.childNodes, render).join('').trim();
}

export function alertContentAsMarkdown(alert: KeywordAlert): string {
  return alert.format === 'html' ? htmlAlertToMarkdown(alert.alert) : alert.alert;
}

export function alertContentAsPlainText(alert: KeywordAlert): string {
  const markdown = alertContentAsMarkdown(alert);
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
