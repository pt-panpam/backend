const IST_OFFSET_MIN = 330; // +5:30

export function getDatePartsInIST(date: Date) {
  const ms = date.getTime() + IST_OFFSET_MIN * 60000;
  const d = new Date(ms);
  const utcY = d.getUTCFullYear();
  const utcM = d.getUTCMonth() + 1;
  const utcD = d.getUTCDate();
  const utcH = d.getUTCHours();
  const utcMin = d.getUTCMinutes();
  const utcS = d.getUTCSeconds();
  return { year: utcY, month: utcM, day: utcD, hour: utcH, minute: utcMin, second: utcS };
}

export function istDateStr(date: Date): string {
  const p = getDatePartsInIST(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function createDateFromIST(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, second));
}

export function isSameISTDate(a: Date, b: Date): boolean {
  return istDateStr(a) === istDateStr(b);
}
