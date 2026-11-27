import {allianceDashboardPath} from '@bom/shared';
import {NextRequest,NextResponse} from 'next/server';
import {decodeSession} from './lib/session';
import {configuredPublicHosts,requestHost} from './lib/publicHost';
/** Paths on the public hosts that are not Compendium pages. */
const COMPENDIUM_EXACT=['/wiki','/wiki/prep'];
/** Once the WoSB Wiki is live on its own domain, set PUBLIC_WIKI_REDIRECT=https://wosbwiki.org and wiki pages here redirect there. */
const wikiRedirect=(process.env.PUBLIC_WIKI_REDIRECT??'').trim().replace(/\/$/,'');
const COMPENDIUM_PASSTHROUGH=['/compendium','/api','/_next','/branding','/wosb','/ads.txt','/robots.txt','/pb-art','/casino','/music','/event-guide','/prep-review','/map-update'];
export async function proxy(req:NextRequest){
 const host=requestHost(req.headers);
 const {rootHosts,all}=configuredPublicHosts();
 if(host&&all.includes(host)){
  const path=req.nextUrl.pathname;
  if(path==='/prep'){const url=req.nextUrl.clone();url.pathname='/wiki/prep';return NextResponse.rewrite(url);}
  if(path.startsWith('/dashboard')){
   const dash=(process.env.PUBLIC_DASHBOARD_URL??'').trim();
   if(dash){try{const dest=new URL(path+req.nextUrl.search,dash);if(dest.hostname.toLowerCase()!==host)return NextResponse.redirect(dest);}catch{}}
   return NextResponse.redirect(new URL('/',req.url));
  }
  const isCompendiumPath=path==='/compendium'||path.startsWith('/compendium/');
  const wikiPath=!COMPENDIUM_EXACT.includes(path)&&!COMPENDIUM_PASSTHROUGH.some(p=>path===p||path.startsWith(p+'/'));
  if(wikiRedirect&&(wikiPath||path==='/wiki'||isCompendiumPath)&&path!=='/favicon.ico'&&path!=='/sitemap.xml'){
   // The main domain's home page is the guild landing page again; wiki pages and the wiki subdomain move to the wiki's domain.
   if(path==='/'&&rootHosts.includes(host))return NextResponse.next();
   const targetPath=path==='/wiki'?'/':isCompendiumPath?(path.replace(/^\/compendium/,'')||'/'):path;
   return NextResponse.redirect(wikiRedirect+targetPath+req.nextUrl.search,301);
  }
  // Everything else on the public hosts is the Sea Battle Compendium (served from the active release).
  if(!COMPENDIUM_EXACT.includes(path)&&!COMPENDIUM_PASSTHROUGH.some(p=>path===p||path.startsWith(p+'/'))){const url=req.nextUrl.clone();url.pathname='/compendium'+(path==='/'?'':path);return NextResponse.rewrite(url);}
  return NextResponse.next();
 }
 if(!req.nextUrl.pathname.startsWith('/dashboard'))return NextResponse.next();
 const token=req.cookies.get('bom_session')?.value,session=token?await decodeSession(token):null;
 if(!session)return NextResponse.redirect(new URL('/',req.url));
 let r:Response;
 try{
  r=await fetch(`${process.env.INTERNAL_API_URL??'http://127.0.0.1:4100'}/v1/access`,{headers:{'x-internal-token':process.env.INTERNAL_API_TOKEN??'','x-discord-user-id':session.id},cache:'no-store',signal:AbortSignal.timeout(8000)});
 }catch{
  return new NextResponse('Service temporarily unavailable. Please refresh in a moment.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
 }
 if(!r.ok)return NextResponse.redirect(new URL('/?auth=member',req.url));
 const access=await r.json();if(access.guestOnly&&req.nextUrl.pathname!=='/dashboard/recruitment'&&req.nextUrl.pathname!=='/dashboard/secret-santa')return NextResponse.redirect(new URL('/dashboard/recruitment',req.url));if(access.allianceOnly&&!allianceDashboardPath(req.nextUrl.pathname))return NextResponse.redirect(new URL('/dashboard/port-battles',req.url));if(access.pbOnly&&req.nextUrl.pathname!=='/dashboard/port-battles'&&req.nextUrl.pathname!=='/dashboard/secret-santa')return NextResponse.redirect(new URL('/dashboard/port-battles',req.url));
 return NextResponse.next();
}
export const config={matcher:['/((?!_next/static|_next/image|api/).*)']};
