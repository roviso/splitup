export const CATEGORIES = {
  food: '🍛', drinks: '🍺', groceries: '🛒', transport: '🛵', travel: '✈️', rent: '🏠',
  utilities: '💡', entertainment: '🎬', shopping: '🛍️', health: '💊', gifts: '🎁', other: '🧾',
} as const;
export type Category = keyof typeof CATEGORIES;

const KEYWORDS: [Category, RegExp][] = [
  ['food', /momo|khana|dal ?bhat|thakali|lunch|dinner|breakfast|pizza|burger|chowmein|sekuwa|newari|restaurant|cafe|biryani|snack|khaja|chiya|tea|coffee/i],
  ['drinks', /beer|bar|drink|wine|whisk|vodka|rakshi|tongba|pub/i],
  ['groceries', /grocer|bhatbhateni|mart|sabji|vegetable|milk|fruit|big ?mart/i],
  ['transport', /taxi|pathao|indrive|bus|fuel|petrol|diesel|parking|tootle|uber|bike|micro/i],
  ['travel', /flight|hotel|trip|pokhara|chitwan|trek|ticket|homestay|resort|mustang/i],
  ['rent', /rent|bhada|room|flat|apartment/i],
  ['utilities', /electric|bijuli|nea|water|internet|wifi|worldlink|vianet|ntc|ncell|recharge|gas/i],
  ['entertainment', /movie|cinema|film|netflix|spotify|game|concert|futsal/i],
  ['shopping', /daraz|cloth|shoe|shop|amazon/i],
  ['health', /pharmacy|medicine|doctor|hospital|clinic/i],
  ['gifts', /gift|birthday|bday|wedding|dashain|tihar/i],
];
export const guessCategory = (text: string): Category | undefined => KEYWORDS.find(([, re]) => re.test(text))?.[0];

export const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares', 'itemized'] as const;
export const PAY_METHODS = ['cash', 'esewa', 'khalti', 'fonepay', 'bank', 'other'] as const;
export const GROUP_TYPES = ['trip', 'home', 'couple', 'food', 'office', 'other'] as const;
