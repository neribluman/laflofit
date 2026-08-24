/**
 * Shared by the server (parsing a day) and the client (previewing one), so it
 * lives apart from interpret.ts — that module is server-only and importing it
 * from a client component breaks the build.
 */
export type MacroSource = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
};

/** Day totals. A missing number counts as zero, not as unknown. */
export function macroTotals(items: MacroSource[]) {
  const sum = (pick: (item: MacroSource) => number | null) =>
    Math.round(items.reduce((total, item) => total + (pick(item) ?? 0), 0));
  return {
    calories: sum((i) => i.calories),
    protein: sum((i) => i.protein_g),
    carbs: sum((i) => i.carbs_g),
    fat: sum((i) => i.fat_g),
    fibre: sum((i) => i.fibre_g),
  };
}
