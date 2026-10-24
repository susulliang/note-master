export type RobotFamily = 'DEEBOT' | 'WINBOT' | 'GOAT';

export interface RobotModelIntent {
  family: RobotFamily;
  series: string;
  canonicalModels: string[];
  variantDisclaimer: string;
}

const GOAT_MODEL_FAMILIES: Array<{
  pattern: RegExp;
  series: string;
  model: string;
}> = [
  { pattern: /\bA\s*-?\s*3000\b/i, series: 'GOAT A Series', model: 'A3000 LiDAR Pro' },
  { pattern: /\bA\s*-?\s*2000\b/i, series: 'GOAT A Series', model: 'A2000 LiDAR Pro' },
  { pattern: /\bO\s*-?\s*1000\b/i, series: 'GOAT O Series', model: 'O1000 LiDAR Pro' },
];

const DEEBOT_MODELS: Array<{ pattern: RegExp; series: string; models: string[] }> = [
  { pattern: /\bX\s*-?\s*2\b/i, series: 'DEEBOT X2 Series', models: ['DEEBOT X2 OMNI', 'DEEBOT X2 COMBO'] },
  { pattern: /\bN\s*-?\s*20(?:\s*(?:E|PLUS|PRO))?\b/i, series: 'DEEBOT N20 Series', models: ['DEEBOT N20', 'DEEBOT N20 PLUS', 'DEEBOT N20 PRO', 'DEEBOT N20E PLUS'] },
  { pattern: /\bT\s*-?\s*90\b/i, series: 'DEEBOT T90 Series', models: ['DEEBOT T90', 'DEEBOT T90 PRO OMNI'] },
];

function extractWinbotModels(text: string): string[] {
  const found = new Set<string>();
  const modelPattern = /\bW\s*-?\s*(\d{1,3}[A-Z]?)\b/gi;
  for (const match of text.matchAll(modelPattern)) {
    const code = match[1].replace(/\s+/g, '').toUpperCase();
    found.add(code === '3' ? 'WINBOT W3 OMNI' : `WINBOT W${code}`);
  }
  return [...found];
}

function isWinbotContext(text: string): boolean {
  return /\bWINBOT\b/i.test(text) || /\bW\s*-?\s*\d{1,3}[A-Z]?\b/i.test(text);
}

function isDeebotContext(text: string): boolean {
  return /\bDEEBOT\b|\bOZMO\b/i.test(text);
}

function uniqueIntents(intents: RobotModelIntent[]): RobotModelIntent[] {
  const seen = new Set<string>();
  return intents.filter((intent) => {
    const key = `${intent.family}:${intent.series}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveRobotModelIntents(text: string): RobotModelIntent[] {
  const intents: RobotModelIntent[] = [];

  for (const goatModel of GOAT_MODEL_FAMILIES) {
    if (goatModel.pattern.test(text)) {
      intents.push({
        family: 'GOAT',
        series: goatModel.series,
        canonicalModels: [goatModel.model],
        variantDisclaimer: '',
      });
    }
  }

  for (const family of DEEBOT_MODELS) {
    if (!family.pattern.test(text)) continue;
    const queryMentionsCombo = /\bCOMBO\b/i.test(text);
    const queryMentionsOmni = /\bOMNI\b/i.test(text);
    const canonicalModels = family.models.filter((model) => {
      if (family.series === 'DEEBOT X2 Series') {
        return queryMentionsCombo ? model.includes('COMBO') : queryMentionsOmni ? model.includes('OMNI') : true;
      }
      if (family.series === 'DEEBOT N20 Series') {
        if (/\bN\s*-?\s*20\s*E\s*PLUS\b/i.test(text)) return model === 'DEEBOT N20E PLUS';
        if (/\bN\s*-?\s*20\s*PRO\b/i.test(text)) return model === 'DEEBOT N20 PRO';
        if (/\bN\s*-?\s*20\s*PLUS\b/i.test(text)) return model === 'DEEBOT N20 PLUS';
        return model === 'DEEBOT N20';
      }
      if (family.series === 'DEEBOT T90 Series') {
        return model === 'DEEBOT T90 PRO OMNI'
          ? /\bPRO\b/i.test(text)
          : !/\bPRO\b/i.test(text);
      }
      return true;
    });
    intents.push({
      family: 'DEEBOT',
      series: family.series,
      canonicalModels: canonicalModels.length ? canonicalModels : family.models,
      variantDisclaimer: family.series === 'DEEBOT X2 Series' && canonicalModels.length > 1
        ? 'X2 shorthand can mean X2 OMNI or X2 COMBO. Ask the agent to confirm which exact model applies before giving variant-specific steps.'
        : family.series === 'DEEBOT N20 Series' || family.series === 'DEEBOT T90 Series'
        ? `This is a series-level match. Identify the exact model and the variant named by each source; note that features or steps can differ between variants and ask the agent to confirm before applying variant-specific instructions.`
        : '',
    });
  }

  if (!intents.some((intent) => intent.family === 'DEEBOT')) {
    const genericDeebotModel = text.match(/\b([NTX])\s*-?\s*(\d{1,3}[A-Z]?)\b/i);
    if (genericDeebotModel) {
      const model = `${genericDeebotModel[1].toUpperCase()}${genericDeebotModel[2].toUpperCase()}`;
      const escapedModel = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const modifiers = text.match(new RegExp(`\\b${escapedModel}\\s+((?:(?:PRO|OMNI|PLUS|E)\\s*){1,3})`, 'i'))?.[1]
        ?.trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
      intents.push({
        family: 'DEEBOT',
        series: `DEEBOT ${model} Series`,
        canonicalModels: [`DEEBOT ${model}${modifiers ? ` ${modifiers}` : ''}`],
        variantDisclaimer: 'This is a series-level match. Confirm the exact model variant before applying variant-specific steps.',
      });
    }
  }

  if (isWinbotContext(text)) {
    const canonicalModels = extractWinbotModels(text);
    const exactW3 = canonicalModels.includes('WINBOT W3 OMNI');
    intents.push({
      family: 'WINBOT',
      series: exactW3 ? 'WINBOT W3 OMNI' : 'WINBOT product family',
      canonicalModels: canonicalModels.length ? canonicalModels : ['WINBOT'],
      variantDisclaimer: '',
    });
  } else if (isDeebotContext(text) && !intents.some((intent) => intent.family === 'DEEBOT')) {
    const ozmo = /\bOZMO\b/i.test(text);
    const modelMatch = text.match(/\b([NTX])\s*-?\s*(\d{1,3}[A-Z]?)\b/i);
    if (modelMatch) {
      const model = `${modelMatch[1].toUpperCase()}${modelMatch[2].toUpperCase()}`;
      intents.push({
        family: 'DEEBOT',
        series: `DEEBOT ${model} Series`,
        canonicalModels: [`DEEBOT ${model}`],
        variantDisclaimer: '',
      });
    } else if (ozmo) {
      intents.push({
        family: 'DEEBOT',
        series: 'DEEBOT / OZMO product family',
        canonicalModels: ['DEEBOT', 'OZMO'],
        variantDisclaimer: '',
      });
    }
  }

  return uniqueIntents(intents);
}

export function expandRobotModelSearchQuery(text: string): {
  query: string;
  intents: RobotModelIntent[];
} {
  const intents = resolveRobotModelIntents(text);
  if (!intents.length) return { query: text.trim(), intents };
  const seriesAliases: Record<string, string[]> = {
    'DEEBOT X2 Series': ['DEEBOT X2 OMNI', 'DEEBOT X2 COMBO'],
    'DEEBOT N20 Series': ['DEEBOT N20', 'DEEBOT N20 PLUS', 'DEEBOT N20 PRO', 'DEEBOT N20E PLUS'],
    'DEEBOT T90 Series': ['DEEBOT T90', 'DEEBOT T90 PRO OMNI'],
  };
  const aliases = intents.flatMap((intent) => [
    intent.family,
    intent.series,
    ...intent.canonicalModels,
    ...(seriesAliases[intent.series] ?? []),
  ]);
  return {
    query: [...new Set([text.trim(), ...aliases].filter(Boolean))].join('\n'),
    intents,
  };
}

export function robotModelGuidance(intents: RobotModelIntent[]): string {
  if (!intents.length) return '';
  return intents.map((intent) => {
    const models = intent.canonicalModels.join(' / ');
    return [
      `Trusted model match: ${models} belongs to ${intent.series} (${intent.family}).`,
      intent.variantDisclaimer,
    ].filter(Boolean).join(' ');
  }).join('\n');
}
