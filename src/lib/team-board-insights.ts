export interface TeamBoardHighlights {
  issueExcerpt: string;
  robotModel: string;
}

function labelValue(text: string, label: RegExp): string {
  const match = label.exec(text);
  return (match?.[1] ?? '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);
}

export function extractTeamBoardHighlights(text: string): TeamBoardHighlights {
  return {
    issueExcerpt: labelValue(
      text,
      /(?:^|\r?\n)\s*(?:\*\*)?Issue\/s(?:\*\*)?\s*:\s*([^\r\n]*)/i,
    ),
    robotModel: labelValue(
      text,
      /(?:^|\r?\n)\s*(?:\*\*)?Robot\s+Model(?:\*\*)?\s*:\s*([^\r\n]*)/i,
    ),
  };
}
