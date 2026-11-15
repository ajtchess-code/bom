import {allianceDashboardPath} from '@bom/shared';
import {NextRequest,NextResponse} from 'next/server';
import {decodeSession} from './lib/session';
/** wiki.bandofmisfits.org (or PUBLIC_WIKI_HOST) serves the public wiki at its root. */
const publicWikiHost=(process.env.PUBLIC_WIKI_HOST??'wiki.bandofmisfits.org').toLowerCase();
const isWikiHost=(req:NextRequest)=>{const h=(req.headers.get('x-forwarded-host')??req.headers.get('host')??'').split(':')[0].toLowerCase();return h===publicWikiHost||h.startsWith('wiki.');};
export async function proxy(req:NextRequest){
 if(isWikiHost(req)){
  const path=req.nextUrl.pathname;
  if(path==='/'||path==='/prep'){const url=req.nextUrl.clone();url.pathname=path==='/'?'/wiki':'/wiki/prep';return NextResponse.rewrite(url);}
  if(path.startsWith('/dashboard')){const dash=process.env.PUBLIC_DASHBOARD_URL;return dash?NextResponse.redirect(new URL(path+req.nextUrl.search,dash)):NextResponse.redirect(new URL('/',req.url));}
  return NextResponse.next();
 }
 if(!req.nextUrl.pathname.startsWith('/dashboard'))return NextResponse.next();
 const token=req.cookies.get('bom_session')?.value,session=token?await decodeSession(token):null;
 if(!session)return NextResponse.redirect(new URL('/',req.url));
 const r=await fetch(`${process.env.INTERNAL_API_URL??'http://127.0.0.1:4100'}/v1/access`,{headers:{'x-internal-token':process.env.INTERNAL_API_TOKEN??'','x-discord-user-id':session.id},cache:'no-store'});
 if(!r.ok)return NextResponse.redirect(new URL('/?auth=member',req.url));
 const access=await r.json();if(access.guestOnly&&req.nextUrl.pathname!=='/dashboard/recruitment')return NextResponse.redirect(new URL('/dashboard/recruitment',req.url));if(access.allianceOnly&&!allianceDashboardPath(req.nextUrl.pathname))return NextResponse.redirect(new URL('/dashboard/events',req.url));if(access.pbOnly&&req.nextUrl.pathname!=='/dashboard/port-battles')return NextResponse.redirect(new URL('/dashboard/port-battles',req.url));
 return NextResponse.next();
}
export const config={matcher:['/dashboard/:path*','/','/prep']};
