export const normalizeSearch=(v:unknown)=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function editDistance(a:string,b:string){const d=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}return d[a.length][b.length];}
export function searchScore(query:string,label:string,detail=''){
 const q=normalizeSearch(query),title=normalizeSearch(label),body=normalizeSearch(detail),terms=q.split(' ').filter(Boolean),words=title.split(' ');
 if(!terms.length)return 0;if(title===q)return 1000;if(title.startsWith(q))return 800;if(title.includes(q))return 650;
 let score=0;for(const term of terms){if(words.includes(term))score+=100;else if(words.some(w=>w.startsWith(term)))score+=75;else if(title.includes(term))score+=55;else if(term.length>=4&&words.some(w=>Math.abs(w.length-term.length)<=1&&editDistance(w,term)<=1))score+=30;else if(body.includes(term))score+=15;else return 0;}return score;
}
