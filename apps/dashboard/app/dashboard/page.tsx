import CommandHome from '@/components/CommandHome';
import {internalFetch} from "@/lib/api";
import {redirect} from "next/navigation";
import Link from "next/link";
import CommandIcon from "@/components/CommandIcon";
import VoicePresenceCard from "@/components/VoicePresenceCard";

export default async function DashboardHome(){
  const [musicR,experienceR,meR,widgetR]=await Promise.all([
    internalFetch('/v1/music/summary'),internalFetch('/v1/feedback/experience'),internalFetch('/v1/platform/me'),internalFetch('/v1/platform/discord-widget')
  ]);
  
  const data:any=musicR.ok?await musicR.json():{history:[],unavailable:true},experience:any=experienceR.ok?await experienceR.json():{favorites:[],recents:[],notifications:[],unread:0},me:any=meR.ok?await meR.json():null,widget:any=widgetR.ok?await widgetR.json():{enabled:false,members:[],voiceChannels:[]};
  const name=me?.displayName??'Captain',history=data.history??[];
  const continueItems=(experience.recents??[]).filter((x:any)=>x.href!=='/dashboard').slice(0,6);
  return <div className="dashboardHomeV41">
    <header className="homeWelcomeV41"><div><span className="eyebrow">BAND OF MISFITS</span><h1>Welcome Back, <span className="goldPulseText">{name}</span></h1></div><Link className="secondaryAction" href="/dashboard/feedback?new=bug"><CommandIcon name="feedback" size={17}/> Report An Issue</Link></header>

    <CommandHome/>
    <section className="homeHeroGrid">
      <article className="memberIdentityCard">
        <div className="memberCardWatermark"><img src="/branding/defaults/bom-logo.png" alt=""/></div>
        <div className="memberCardTop"><span className="memberCardAvatar">{me?.avatar?<img src={me.avatar} alt=""/>:<img src="/branding/defaults/bom-logo.png" alt=""/>}</span><span className="memberCardBadge">{me?.rank??'Guest'}</span></div>
        <div className="memberCardCopy"><small>BAND OF MISFITS · MEMBER CARD</small><h2>{name}</h2><p>{me?.memberNumber??'BOM-000000'}</p></div>
        <div className="memberCardMeta"><span><small>Community Rank</small><b>{me?.rank??'Guest'}</b></span><span><small>Joined</small><b>{me?.joinedAt?new Date(me.joinedAt).toLocaleDateString([], {month:'short',year:'numeric'}):'—'}</b></span></div>
      </article>

      <VoicePresenceCard initial={widget}/> 
    </section>

    <section className="homeCompactGrid">
      <article className="panel continueCard"><header><div><span className="cardKicker">YOUR WORKSPACE</span><h2>Continue</h2></div></header><div className="continueGrid">{continueItems.map((x:any)=><Link key={`${x.kind}-${x.item_key}`} href={x.href}><span><b>{x.label}</b><small>{x.metadata?.subtitle??x.metadata?.detail??x.href}</small></span><CommandIcon name="arrow" size={16}/></Link>)}{!continueItems.length&&<div className="homeEmpty"><b>Your recently used tools will appear here.</b></div>}</div></article>
      <article className="panel homeMusicStatus"><header><div><span className="cardKicker">MUSIC</span><h2>{data.activeRoom?.state?.track?'Playing Now':'Ready To Listen'}</h2></div><Link href="/dashboard/music">Open Music <CommandIcon name="arrow" size={14}/></Link></header>{data.activeRoom?.state?.track?<div className="homeNowPlaying"><span>{data.activeRoom.state.track.artworkUrl?<img src={data.activeRoom.state.track.artworkUrl} alt=""/>:<CommandIcon name="music" size={28}/>}</span><div><b>{data.activeRoom.state.track.title}</b><small>{data.activeRoom.state.track.author}</small></div></div>:<div className="homeEmpty compact"><CommandIcon name="music" size={22}/><b>No track is playing right now.</b></div>}</article>
    </section>

    <section className="panel homeRecentMusic"><header><div><span className="cardKicker">RECENT LISTENING</span><h2>Recently Played</h2></div><Link href="/dashboard/music">View Music <CommandIcon name="arrow" size={14}/></Link></header><div className="recentMusicRail">{history.slice(0,8).map((h:any)=><article key={h.id}><span className="recentMusicArt">{h.artwork_url?<img src={h.artwork_url} alt=""/>:<CommandIcon name="music" size={22}/>}</span><span><b>{h.title}</b><small>{h.author}</small></span><time>{new Date(h.started_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time></article>)}{!history.length&&<div className="homeEmpty"><b>Nothing has been played yet.</b></div>}</div></section>
  </div>;
}
