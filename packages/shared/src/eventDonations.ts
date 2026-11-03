export const HEAVY_SHOT_TARGET=5000,HEAVY_SHOT_GOAL=500000;
export const EVENT_DONATIONS_SQL=`SELECT user_id, (ARRAY_AGG(display_name ORDER BY recorded_at DESC,id DESC))[1] display_name, SUM(amount)::bigint total,
 MAX(recorded_at) last_donation FROM guild_event_donations WHERE campaign_id=$1 AND voided_at IS NULL
 GROUP BY user_id HAVING SUM(amount)>0 ORDER BY SUM(amount) DESC,MAX(recorded_at) ASC,user_id ASC`;
export function donationSummary(rows:any[]){const donors=rows.map((r,i)=>({...r,total:Number(r.total),rank:i+1})),total=donors.reduce((n,r)=>n+r.total,0);return {donors,total,goal:HEAVY_SHOT_GOAL,target:HEAVY_SHOT_TARGET,percent:total/HEAVY_SHOT_GOAL*100,remaining:Math.max(0,HEAVY_SHOT_GOAL-total),complete:donors.filter(r=>r.total>=HEAVY_SHOT_TARGET).length};}
