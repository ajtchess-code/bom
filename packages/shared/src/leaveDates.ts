/** Deterministic, calendar-valid return-date parser. Dates mean noon UTC on the chosen day. */
export function parseLeaveDate(input:string, now=new Date()):Date {
  const text=String(input??'').trim().toLowerCase().replace(/,/g,'').replace(/\s+/g,' ');
  const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),12));
  let target:Date|undefined;
  const relative=text.match(/^(?:in )?(\d{1,4})\s*(days?|d|weeks?|w|months?|years?)\s*(?:from now)?$/);
  if(relative){
    const count=Number(relative[1]);
    if(count<1||count>730)throw new Error('Enter a return date no more than two years away.');
    target=new Date(today);
    if(/^d/.test(relative[2]))target.setUTCDate(target.getUTCDate()+count);
    else if(/^w/.test(relative[2]))target.setUTCDate(target.getUTCDate()+count*7);
    else if(/^m/.test(relative[2]))target.setUTCMonth(target.getUTCMonth()+count);
    else target.setUTCFullYear(target.getUTCFullYear()+count);
  } else if(text==='tomorrow') {target=new Date(today);target.setUTCDate(target.getUTCDate()+1);}
  else if(text==='next week') {target=new Date(today);target.setUTCDate(target.getUTCDate()+7);}
  else {
    const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const ix=(s:string)=>months.findIndex(m=>s.startsWith(m));
    let day=0,month=0,year=0;
    const iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const monthFirst=text.match(/^(?:on )?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/);
    const dayFirst=text.match(/^(?:on )?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/);
    if(iso){year=Number(iso[1]);month=Number(iso[2])-1;day=Number(iso[3]);}
    else if(monthFirst){month=ix(monthFirst[1]);day=Number(monthFirst[2]);year=monthFirst[3]?Number(monthFirst[3]):today.getUTCFullYear();}
    else if(dayFirst){month=ix(dayFirst[2]);day=Number(dayFirst[1]);year=dayFirst[3]?Number(dayFirst[3]):today.getUTCFullYear();}
    else throw new Error('Try “in 14 days”, “August 6th”, “16 August”, “Jan 12 2028”, or YYYY-MM-DD.');
    if(month<0||month>11||day<1||day>31)throw new Error('That date is not valid.');
    const make=(yr:number)=>new Date(Date.UTC(yr,month,day,12));
    target=make(year);
    if(target.getUTCFullYear()!==year||target.getUTCMonth()!==month||target.getUTCDate()!==day)throw new Error('That calendar date does not exist.');
    if(!iso&&!monthFirst?.[3]&&!dayFirst?.[3]&&target.getTime()<today.getTime())target=make(year+1);
  }
  if(!target||Number.isNaN(target.getTime())||target.getTime()<today.getTime())throw new Error('Choose today or a future return date.');
  if(target.getTime()>today.getTime()+731*86400000)throw new Error('Choose a return date within two years.');
  return target;
}
