export const CAT_SELECTION_STORAGE_KEY = '__app_ecovacs_cat_selection';

export const CAT_CHOICES = [
  {
    id: 'hunao',
    name: 'Hunao',
    coat: 'Silver',
    tint: 'text-slate-200',
    swatch: 'bg-slate-300',
    sprite: '/assets/cat/hunao-sprites.png',
    sleepSprite: '/assets/cat/hunao-falling-asleep.png',
  },
  {
    id: 'siam',
    name: 'Siam',
    coat: 'Blue',
    tint: 'text-sky-300',
    swatch: 'bg-sky-400',
    sprite: '/assets/cat/siam-sprites.png',
    sleepSprite: '/assets/cat/siam-falling-asleep.png',
  },
  {
    id: 'heyhey',
    name: 'Heyhey',
    coat: 'Black',
    tint: 'text-violet-300',
    swatch: 'bg-violet-400',
    sprite: '/assets/cat/heyhey-sprites.png',
    sleepSprite: '/assets/cat/heyhey-falling-asleep.png',
  },
  {
    id: 'heyheyhey',
    name: 'Heyheyhey',
    coat: 'Black',
    tint: 'text-neutral-200',
    swatch: 'bg-neutral-500',
    sprite: '/assets/cat/heyheyhey-sprites.png',
    sleepSprite: '/assets/cat/heyheyhey-falling-asleep.png',
  },
  {
    id: 'ailu',
    name: 'Ailu',
    coat: 'Blue onesie',
    tint: 'text-indigo-300',
    swatch: 'bg-indigo-400',
    sprite: '/assets/cat/ailu-sprites.png',
    sleepSprite: '/assets/cat/ailu-falling-asleep.png',
  },
  {
    id: 'bella',
    name: 'Bella',
    coat: 'Calico',
    tint: 'text-orange-300',
    swatch: 'bg-orange-400',
    sprite: '/assets/cat/bella-sprites.png',
    sleepSprite: '/assets/cat/bella-falling-asleep.png',
  },
] as const;

export type CatId = (typeof CAT_CHOICES)[number]['id'];

/** Eating-can sheet (16 frames, same 4×4 64px layout) — shown while the
 *  heyheyhey cat enjoys a "Fancy Feast" bought from the spice store. */
export const CAT_EATING_SPRITE = '/assets/cat/heyheyhey-eating-sprites.png';
/** Window event dispatched after a successful store purchase. */
export const CAT_EAT_EVENT = 'cat-eat';

/** Payload of CAT_EAT_EVENT — an explicit product identity so the pet
 *  system never infers "food" from a product-name regex. */
export interface CatEatDetail {
  productId: string;
  productName: string;
  /** True when the product's category is 'food'. */
  isFood: boolean;
}

export function normalizeCatId(value: unknown): CatId {
  return CAT_CHOICES.find((choice) => choice.id === value)?.id ?? 'hunao';
}

export function getCatSprite(catId: CatId): string {
  return CAT_CHOICES.find((choice) => choice.id === catId)?.sprite ?? CAT_CHOICES[0].sprite;
}

/** Falling-asleep sheet (16 frames, same 4×4 layout): frame 1 is the
 *  stand-up pose, frame 16 is deep asleep. Falls asleep playing it
 *  forwards; wakes up playing it backwards (see cat-sprite-sleep/wake). */
export function getCatSleepSprite(catId: CatId): string {
  const choice = CAT_CHOICES.find((c) => c.id === catId) ?? CAT_CHOICES[0];
  return choice.sleepSprite ?? choice.sprite;
}
