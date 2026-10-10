export const CAT_SELECTION_STORAGE_KEY = '__app_ecovacs_cat_selection';

export const CAT_CHOICES = [
  {
    id: 'hunao',
    name: 'Hunao',
    coat: 'Silver',
    tint: 'text-slate-200',
    swatch: 'bg-slate-300',
    sprite: '/assets/cat/hunao-sprites.png',
  },
  {
    id: 'siam',
    name: 'Siam',
    coat: 'Blue',
    tint: 'text-sky-300',
    swatch: 'bg-sky-400',
    sprite: '/assets/cat/siam-sprites.png',
  },
  {
    id: 'heyhey',
    name: 'Heyhey',
    coat: 'Black',
    tint: 'text-violet-300',
    swatch: 'bg-violet-400',
    sprite: '/assets/cat/heyhey-sprites.png',
  },
  {
    id: 'heyheyhey',
    name: 'Heyheyhey',
    coat: 'Black',
    tint: 'text-neutral-200',
    swatch: 'bg-neutral-500',
    sprite: '/assets/cat/heyheyhey-sprites.png',
  },
] as const;

export type CatId = (typeof CAT_CHOICES)[number]['id'];

export function normalizeCatId(value: unknown): CatId {
  return CAT_CHOICES.find((choice) => choice.id === value)?.id ?? 'hunao';
}

export function getCatSprite(catId: CatId): string {
  return CAT_CHOICES.find((choice) => choice.id === catId)?.sprite ?? CAT_CHOICES[0].sprite;
}
