export function getTzOffsetMinutes(date: Date, timezone: string): number {
  const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
  const tzDate = new Date(tzStr);
  return (tzDate.getTime() - date.getTime()) / 60000;
}

export function getDatePartsInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function createDateFromTz(year: number, month: number, day: number, hour: number, minute: number, second: number, timezone: string): Date {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTzOffsetMinutes(utcDate, timezone);
  return new Date(utcDate.getTime() - offset * 60000);
}
