/** Calendar dates stay in the workspace zone; API bounds remain UTC and exclusive. */
export function localDay(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
  const part = (key:string) => parts.find(p=>p.type===key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftDay(day:string, amount:number):string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid calendar date');
  const date=new Date(day+'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==day) throw new Error('Invalid calendar date');
  date.setUTCDate(date.getUTCDate()+amount);
  return date.toISOString().slice(0,10);
}
export function dayStart(day:string, timezone:string):Date {
  shiftDay(day,0);
  const middle=Date.parse(day+'T12:00:00Z');
  let low=middle-48*3600000, high=middle+48*3600000;
  // Find the first instant of the local calendar date, including midnight DST jumps.
  while(high-low>1){const mid=Math.floor((low+high)/2);if(localDay(new Date(mid),timezone)<day)low=mid;else high=mid;}
  if(localDay(new Date(high),timezone)!==day)throw new Error('Calendar date does not exist in this timezone');
  return new Date(high);
}
export function reportRange(from:string,to:string,timezone:string):{from:string;to:string} {
  if(from>to)throw new Error('Start date must precede end date');
  return {from:dayStart(from,timezone).toISOString(),to:dayStart(shiftDay(to,1),timezone).toISOString()};
}
