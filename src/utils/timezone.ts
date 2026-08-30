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

// Compute the next recap reveal slot strictly after `from`, given the two
// configured reveal hours (in IST). Returns the earliest future slot date.
export function nextRecapSlot(from: Date, hour1: number, hour2: number): Date {
  const p = getDatePartsInIST(from);
  const candidates = [
    createDateFromIST(p.year, p.month, p.day, hour1, 0, 0),
    createDateFromIST(p.year, p.month, p.day, hour2, 0, 0),
    createDateFromIST(p.year, p.month, p.day + 1, hour1, 0, 0),
  ];
  for (const c of candidates) {
    if (c.getTime() > from.getTime()) return c;
  }
  return candidates[candidates.length - 1];
}
