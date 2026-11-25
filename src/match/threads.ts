// How many processor threads the image model may use. Threads need
// SharedArrayBuffer, which browsers allow only on cross-origin isolated pages
// (served over HTTPS with COOP/COEP headers). Safari may under-report its
// cores, so isolation alone allows at least two.
export const MAX_THREADS = 4;

export function threadCount(wanted: number | undefined, isolated: boolean, cores: number): number {
  if (!isolated) return 1;
  const max = Math.min(MAX_THREADS, Math.max(2, cores || 0));
  return wanted && wanted > 0 ? Math.min(wanted, max) : max;
}
