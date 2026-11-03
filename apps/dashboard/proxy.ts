import {allianceDashboardPath} from '@bom/shared';
import {NextRequest,NextResponse} from 'next/server';
import {decodeSession} from './lib/session';
export async function proxy(req:NextRequest){
 const token=req.cookies.get('bom_session')?.value,session=token?await decodeSession(token):null;
 if(!session)return NextResponse.redirect(new URL('/',req.url));
 const r=await fetch(`${process.env.INTERNAL_API_URL??'http://127.0.0.1:4100'}/v1/access`,{headers:{'x-internal-token':process.env.INTERNAL_API_TOKEN??'','x-discord-user-id':session.id},cache:'no-store'});
 if(!r.ok)return NextResponse.redirect(new URL('/?auth=member',req.url));
 const access=await r.json();if(access.guestOnly&&req.nextUrl.pathname!=='/dashboard/recruitment')return NextResponse.redirect(new URL('/dashboard/recruitment',req.url));if(access.allianceOnly&&!allianceDashboardPath(req.nextUrl.pathname))return NextResponse.redirect(new URL('/dashboard/events',req.url));if(access.pbOnly&&req.nextUrl.pathname!=='/dashboard/port-battles')return NextResponse.redirect(new URL('/dashboard/port-battles',req.url));
 return NextResponse.next();
}
export const config={matcher:['/dashboard/:path*']};
