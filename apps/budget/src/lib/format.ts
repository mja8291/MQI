/** Rs million with two decimals, e.g. "1,333.50". */
export function rs(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function int(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return n.toLocaleString('en-PK');
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return `${n.toFixed(1)}%`;
}

export function score(n: number | null): string {
  return n === null ? 'No survey' : `${Math.round(n)}%`;
}

export function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${rs(Math.abs(n))}`;
}

export function dateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A file-name-safe slug. */
export function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
