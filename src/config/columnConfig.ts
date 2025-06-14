export const ALWAYS_HIDDEN_COLUMNS: string[] = [
  'html_path'
];

// Columns present in many CSVs but should be hidden by default (user can enable through Manage Columns)
export const HIDDEN_BY_DEFAULT_COLUMNS: string[] = [
  'url',
  'pri/we',
  'pro/cal',
  'content',
  'description',
  'category',
];

// Columns explicitly shown by default even if not in CSV order (optional)
export const SHOWN_BY_DEFAULT_COLUMNS: string[] = [
  'imgUrl',
  'name',
  'megacategory',
  'price',
  'weight',
  'calories',
  'proteins',
  'fats',
  'carbohydrates',
  'average_rating',
  'rating_count',
  'availability',
  'last_upd_time',
]; 