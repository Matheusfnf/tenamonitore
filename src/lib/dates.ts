/** '2026-07-14' -> '14/07/2026' (a data da visita trafega como string ISO). */
export function formatVisitDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
