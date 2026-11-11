import { z } from "zod";


export const PLATFORM_CONFIG_VERSION = 4;
export const PlatformFeatureFlag = z.enum([
  "recruitment","portBattles","wiki","music","membership","publicTools",
  "activityFeed","notificationCenter","supportCenter","experimentalUi"
]);
export type PlatformFeatureFlag = z.infer<typeof PlatformFeatureFlag>;
export const PlatformFeatureFlags = z.record(PlatformFeatureFlag,z.boolean()).default({});
export const DEFAULT_PLATFORM_FEATURES:Record<PlatformFeatureFlag,boolean>={
  recruitment:true,portBattles:true,wiki:true,music:true,membership:true,publicTools:true,
  activityFeed:true,notificationCenter:true,supportCenter:true,experimentalUi:false
};
export const PlatformSettingsSchema=z.object({
  configVersion:z.number().int().min(1).default(PLATFORM_CONFIG_VERSION),
  featureFlags:PlatformFeatureFlags.optional(),
  navigation:z.object({hidden:z.array(z.string()).default([]),order:z.array(z.string()).default([])}).partial().default({}),
  defaults:z.record(z.unknown()).default({})
});
export type PlatformSettings=z.infer<typeof PlatformSettingsSchema>;

export const SkipMode = z.enum(["MAJORITY", "SUPERMAJORITY", "UNANIMOUS", "DJ_REQUESTER", "NO_SKIP"]);
export type SkipMode = z.infer<typeof SkipMode>;

export const AutoplayProfile = z.enum(["SIMILAR","SAME_ARTIST","DISCOVERY","FAMILIAR","PARTY","DEEP_CUTS","BOM_RADIO"]);
export type AutoplayProfile = z.infer<typeof AutoplayProfile>;
export const QueueReorderMode = z.enum(["ALL_LISTENERS","REQUESTER_ONLY","DJ_ONLY","LOCKED"]);
export type QueueReorderMode = z.infer<typeof QueueReorderMode>;
export const TransitionMode = z.enum(["OFF","GAPLESS","FADE_2S","FADE_5S","SMOOTH_DJ","RADIO"]);
export type TransitionMode = z.infer<typeof TransitionMode>;
export const MusicMood = z.enum(["ENERGETIC","RELAXED","SAD","FOCUSED","PARTY","NOSTALGIC","CHILL","HEAVY","HAPPY","DARK"]);
export type MusicMood = z.infer<typeof MusicMood>;

export const MusicPermission = z.enum([
  "USE_MUSIC", "MANAGE_MUSIC", "FORCE_SKIP", "CHANGE_SKIP_POLICY",
  "MANAGE_QUEUE", "MANAGE_FILTERS", "DJ", "MANAGE_INTEGRATIONS", "BYPASS_RESTRICTIONS"
]);
export type MusicPermission = z.infer<typeof MusicPermission>;

export const TrackOrigin = z.enum(["USER","AUTOPLAY","RADIO","RECOVERY","SCHEDULE","PLAYLIST"]);
export type TrackOrigin = z.infer<typeof TrackOrigin>;
export const RequestSurface = z.enum(["DISCORD","DASHBOARD","SYSTEM"]);
export type RequestSurface = z.infer<typeof RequestSurface>;
export const TrackResolution = z.object({strategy:z.string(),score:z.number().optional(),provider:z.string().optional(),attempts:z.number().int().optional(),matchedQuery:z.string().optional(),fallbackProviders:z.array(z.string()).optional()});
export const TrackInfo = z.object({
  encoded: z.string().optional(), identifier: z.string(), title: z.string(), author: z.string(),
  length: z.number(), uri: z.string().nullable().optional(), artworkUrl: z.string().nullable().optional(),
  isrc: z.string().nullable().optional(), sourceName: z.string(), isStream: z.boolean().default(false), resolution:TrackResolution.optional()
});
export type TrackInfo = z.infer<typeof TrackInfo>;

export const WorkerCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAY"), roomId: z.string(), guildId: z.string(), voiceChannelId: z.string(), query: z.string(), encoded: z.string().optional(), trackInfo: TrackInfo.optional(), requesterId: z.string(), requestId: z.string(), traceId: z.string().optional(), startPositionMs: z.number().int().min(0).optional(), transitionMode: TransitionMode.optional(), transitionMs: z.number().int().min(0).max(10000).optional(), origin:TrackOrigin.optional(), surface:RequestSurface.optional(), originalQuery:z.string().optional() }),
  z.object({ type: z.literal("PAUSE"), roomId: z.string(), guildId: z.string() }),
  z.object({ type: z.literal("RESUME"), roomId: z.string(), guildId: z.string() }),
  z.object({ type: z.literal("SKIP"), roomId: z.string(), guildId: z.string(), expectedRequestId: z.string().optional() }),
  z.object({ type: z.literal("STOP"), roomId: z.string(), guildId: z.string() }),
  z.object({ type: z.literal("LEAVE"), roomId: z.string(), guildId: z.string() }),
  z.object({ type: z.literal("SEEK"), roomId: z.string(), guildId: z.string(), positionMs: z.number().int().min(0) }),
  z.object({ type: z.literal("FILTER"), roomId: z.string(), guildId: z.string(), preset: z.string() }),
  z.object({ type: z.literal("VOLUME"), roomId: z.string(), guildId: z.string(), volume: z.number().int().min(0).max(200) }),
  z.object({ type: z.literal("LYRICS"), roomId: z.string(), guildId: z.string() })
]);
export type WorkerCommand = z.infer<typeof WorkerCommand>;

export const WorkerEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("READY"), workerId: z.string(), userId: z.string(), username: z.string() }),
  z.object({ type: z.literal("TRACK_START"), workerId: z.string(), roomId: z.string(), guildId: z.string(), requesterId: z.string(), requestId: z.string(), traceId: z.string().optional(), track: TrackInfo, origin:TrackOrigin.optional(), surface:RequestSurface.optional(), originalQuery:z.string().optional() }),
  z.object({ type: z.literal("TRACK_FALLBACK"), workerId:z.string(), roomId:z.string(), guildId:z.string(), requesterId:z.string(), requestId:z.string(), traceId:z.string().optional(), previousTrack:TrackInfo.optional(), track:TrackInfo, reason:z.string(), origin:TrackOrigin.optional(), surface:RequestSurface.optional(), originalQuery:z.string().optional() }),
  z.object({ type: z.literal("TRACK_END"), workerId: z.string(), roomId: z.string(), guildId: z.string(), requestId: z.string().optional(), traceId: z.string().optional(), reason: z.string().optional() }),
  z.object({ type: z.literal("PLAYER_UPDATE"), workerId: z.string(), roomId: z.string(), guildId: z.string(), position: z.number(), ping: z.number().optional() }),
  z.object({ type: z.literal("STATE"), workerId: z.string(), roomId: z.string(), guildId: z.string(), status: z.enum(["PLAYING","PAUSED"]) }),
  z.object({ type: z.literal("LYRICS"), workerId: z.string(), roomId: z.string(), guildId: z.string(), lyrics: z.unknown() }),
  z.object({ type: z.literal("METRIC"), workerId: z.string(), roomId: z.string().optional(), guildId: z.string(), requestId: z.string().optional(), traceId: z.string().optional(), metric: z.string(), valueMs: z.number(), details: z.record(z.unknown()).optional() }),
  z.object({ type: z.literal("ERROR"), workerId: z.string(), roomId: z.string().optional(), guildId: z.string().optional(), requestId: z.string().optional(), traceId: z.string().optional(), message: z.string(), fatal: z.boolean().optional() })
]);
export type WorkerEvent = z.infer<typeof WorkerEvent>;

export type QueueItem = { requestId: string; roomId: string; guildId: string; voiceChannelId: string; query: string; display?: string; encoded?: string; trackInfo?: TrackInfo; requesterId: string; requesterName?: string; requesterAvatar?: string; requestedAt: number; traceId?: string; startPositionMs?: number; mood?: MusicMood; source?: TrackOrigin; surface?: RequestSurface; originalQuery?: string };
export type RoomRuntimeState = { workerId?: string; status: "IDLE"|"PLAYING"|"PAUSED"|"BUFFERING"|"ERROR"; track?: TrackInfo; position?: number; requesterId?: string; requestId?: string; historyId?: string; origin?: TrackOrigin; surface?: RequestSurface; originalQuery?: string; error?: string; updatedAt: number };

export const SOURCE_CAPABILITIES=[
  {id:"youtube",label:"YouTube / YouTube Music",search:true,playlists:true,albums:false,radio:false,seek:true,live:true,lyrics:true,artwork:true},
  {id:"soundcloud",label:"SoundCloud",search:true,playlists:true,albums:false,radio:false,seek:true,live:true,lyrics:false,artwork:true},
  {id:"spotify",label:"Spotify metadata",search:true,playlists:true,albums:true,radio:false,seek:false,live:false,lyrics:false,artwork:true},
  {id:"applemusic",label:"Apple Music metadata",search:true,playlists:true,albums:true,radio:false,seek:false,live:false,lyrics:false,artwork:true},
  {id:"deezer",label:"Deezer metadata",search:true,playlists:true,albums:true,radio:false,seek:false,live:false,lyrics:false,artwork:true},
  {id:"http",label:"Direct HTTP / Radio",search:false,playlists:false,albums:false,radio:true,seek:true,live:true,lyrics:false,artwork:false}
] as const;

export const FILTER_PRESETS: Record<string, object> = {
  flat: {},
  bass_boost: { equalizer: [{band:0,gain:.18},{band:1,gain:.16},{band:2,gain:.12},{band:3,gain:.08}] },
  bass_boost_high: { equalizer: [{band:0,gain:.32},{band:1,gain:.27},{band:2,gain:.20},{band:3,gain:.12}] },
  deep_bass: { equalizer: [{band:0,gain:.28},{band:1,gain:.22},{band:2,gain:.15},{band:3,gain:.06}] },
  subwoofer: { equalizer: [{band:0,gain:.38},{band:1,gain:.30},{band:2,gain:.12},{band:3,gain:-.04}] },
  treble_boost: { equalizer: [{band:9,gain:.08},{band:10,gain:.12},{band:11,gain:.14},{band:12,gain:.16},{band:13,gain:.18}] },
  vocal_boost: { equalizer: [{band:5,gain:.08},{band:6,gain:.14},{band:7,gain:.16},{band:8,gain:.10},{band:0,gain:-.04}] },
  warm: { equalizer: [{band:0,gain:.06},{band:1,gain:.08},{band:2,gain:.07},{band:9,gain:-.04},{band:10,gain:-.06}] },
  bright: { equalizer: [{band:5,gain:.04},{band:7,gain:.08},{band:9,gain:.10},{band:11,gain:.08}] },
  acoustic: { equalizer: [{band:1,gain:.05},{band:4,gain:.08},{band:5,gain:.11},{band:8,gain:.07},{band:12,gain:.04}] },
  classical: { equalizer: [{band:0,gain:.04},{band:4,gain:.03},{band:7,gain:.04},{band:10,gain:.07},{band:13,gain:.08}] },
  rock: { equalizer: [{band:0,gain:.08},{band:2,gain:.06},{band:6,gain:.08},{band:8,gain:.09},{band:11,gain:.06}] },
  metal: { equalizer: [{band:0,gain:.10},{band:1,gain:.07},{band:6,gain:.10},{band:7,gain:.12},{band:10,gain:.08}] },
  pop: { equalizer: [{band:1,gain:.06},{band:5,gain:.05},{band:7,gain:.10},{band:9,gain:.08}] },
  electronic: { equalizer: [{band:0,gain:.12},{band:1,gain:.10},{band:6,gain:.05},{band:9,gain:.08},{band:12,gain:.07}] },
  hip_hop: { equalizer: [{band:0,gain:.16},{band:1,gain:.12},{band:2,gain:.06},{band:7,gain:.06},{band:10,gain:.04}] },
  nightcore: { timescale: { speed: 1.18, pitch: 1.18, rate: 1.0 } },
  nightcore_light: { timescale: { speed: 1.10, pitch: 1.10, rate: 1.0 } },
  vaporwave: { timescale: { speed: .86, pitch: .82, rate: 1.0 } },
  daycore: { timescale: { speed: .90, pitch: .90, rate: 1.0 } },
  slow: { timescale: { speed: .85, pitch: 1.0, rate: 1.0 } },
  fast: { timescale: { speed: 1.15, pitch: 1.0, rate: 1.0 } },
  speed_125: { timescale: { speed: 1.25, pitch: 1.0, rate: 1.0 } },
  karaoke: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } },
  karaoke_soft: { karaoke: { level: .65, monoLevel: .8, filterBand: 220.0, filterWidth: 120.0 } },
  tremolo: { tremolo: { frequency: 2.0, depth: .45 } },
  vibrato: { vibrato: { frequency: 2.0, depth: .25 } },
  rotation_8d: { rotation: { rotationHz: .18 } },
  rotation_slow: { rotation: { rotationHz: .08 } },
  soft: { lowPass: { smoothing: 14.0 } },
  underwater: { lowPass: { smoothing: 40.0 }, equalizer: [{band:0,gain:.10},{band:1,gain:.06},{band:8,gain:-.15},{band:10,gain:-.20}] },
  muffled: { lowPass: { smoothing: 35.0 } },
  lo_fi: { lowPass: { smoothing: 20.0 }, equalizer: [{band:0,gain:.08},{band:10,gain:-.10},{band:11,gain:-.12},{band:12,gain:-.14}] },
  radio: { equalizer: [{band:0,gain:-.12},{band:1,gain:-.08},{band:6,gain:.08},{band:7,gain:.10},{band:12,gain:-.12}], lowPass:{smoothing:8.0} },
  mono: { channelMix: { leftToLeft:.5,leftToRight:.5,rightToLeft:.5,rightToRight:.5 } },
  wide: { channelMix: { leftToLeft:1.0,leftToRight:-.15,rightToLeft:-.15,rightToRight:1.0 } },
  left_channel: { channelMix: { leftToLeft:1.0,leftToRight:1.0,rightToLeft:0.0,rightToRight:0.0 } },
  right_channel: { channelMix: { leftToLeft:0.0,leftToRight:0.0,rightToLeft:1.0,rightToRight:1.0 } },
  party: { equalizer: [{band:0,gain:.12},{band:1,gain:.10},{band:6,gain:.06},{band:7,gain:.08},{band:12,gain:.10}], tremolo:{frequency:1.4,depth:.12} },
  concert: { equalizer: [{band:0,gain:.06},{band:5,gain:.04},{band:8,gain:.06},{band:12,gain:.05}], rotation:{rotationHz:.025} }
};

export const LANGUAGES=[
  {value:"en-US",label:"English",emoji:"🇺🇸"},{value:"es",label:"Español",emoji:"🇪🇸"},{value:"ru",label:"Русский",emoji:"🇷🇺"},{value:"ko",label:"한국어",emoji:"🇰🇷"},{value:"zh-CN",label:"简体中文",emoji:"🇨🇳"},
  {value:"de",label:"Deutsch",emoji:"🇩🇪"},{value:"fr",label:"Français",emoji:"🇫🇷"},{value:"pt-BR",label:"Português",emoji:"🇧🇷"},{value:"ja",label:"日本語",emoji:"🇯🇵"},{value:"it",label:"Italiano",emoji:"🇮🇹"},
  {value:"pl",label:"Polski",emoji:"🇵🇱"},{value:"tr",label:"Türkçe",emoji:"🇹🇷"},{value:"uk",label:"Українська",emoji:"🇺🇦"},{value:"nl",label:"Nederlands",emoji:"🇳🇱"},{value:"sv",label:"Svenska",emoji:"🇸🇪"},
  {value:"no",label:"Norsk",emoji:"🇳🇴"},{value:"da",label:"Dansk",emoji:"🇩🇰"},{value:"fi",label:"Suomi",emoji:"🇫🇮"},{value:"cs",label:"Čeština",emoji:"🇨🇿"},{value:"el",label:"Ελληνικά",emoji:"🇬🇷"}
] as const;

const STRINGS:Record<string,Record<string,string>>={
  "en-US":{
    privateControls:"Private Controls",nothingPlaying:"Nothing is playing right now.",readyRequests:"Ready for requests",queue:"Queue",pause:"Pause",resume:"Resume",voteSkip:"Vote Skip",lyrics:"Lyrics",addMusic:"Add Music",filters:"Filters",recommendations:"Recommendations",close:"Close",more:"More",controls:"Controls",requestHint:"Type a song, artist, playlist URL, radio stream, or audio URL in this channel to queue it.",inactivity:"This private panel closes automatically after **90 seconds of inactivity**.",language:"Language",addMusicTitle:"Add music",addMusicLabel:"Song, artist, playlist, stream, or URL",addMusicPlaceholder:"e.g. Metallica Enter Sandman",nowPlaying:"NOW PLAYING",musicOperations:"Music operations",workersOnline:"workers online",upNext:"Up next",tracks:"tracks",voiceWorkers:"Voice workers",liveHealth:"live health",audioFilters:"Audio filters",recentListening:"Recent listening",roomConfiguration:"VOICE SESSION",noRooms:"No active voice session.",createRoomHelp:"Join a Discord voice channel and BOM will route a music worker automatically.",commandSent:"Command sent",languageSaved:"Language preference saved",liveLyrics:"LIVE LYRICS",lyricsWaiting:"Timed lyrics will appear here when available.",createRoom:"Start voice session",musicPermissions:"Music permissions",admin:"ADMIN",roleAccess:"ROLE ACCESS",name:"Name",requestChannel:"Voice chat",voiceChannel:"Voice channel",skipPolicy:"Skip policy",autoplay:"Autoplay",cleanRequests:"Clean requests",saveRule:"Save rule",rule:"Rule",allow:"Allow",deny:"Deny",discordRole:"Discord role",permission:"Permission",recommendedForYou:"Recommended for you",queueThis:"Queue",trackDetails:"Track details",didYouKnow:"Did you know?"},
  es:{
    privateControls:"Controles privados",nothingPlaying:"No hay música reproduciéndose.",readyRequests:"Listo para solicitudes",queue:"Cola",pause:"Pausar",resume:"Reanudar",voteSkip:"Votar para saltar",lyrics:"Letra",addMusic:"Añadir música",filters:"Filtros",recommendations:"Recomendaciones",close:"Cerrar",more:"Más",controls:"Controles",requestHint:"Escribe una canción, artista, lista, radio o URL de audio para añadirla a la cola.",inactivity:"Este panel privado se cierra tras **90 segundos de inactividad**.",language:"Idioma",addMusicTitle:"Añadir música",addMusicLabel:"Canción, artista, lista, radio o URL",addMusicPlaceholder:"p. ej. Metallica Enter Sandman",nowPlaying:"REPRODUCIENDO",musicOperations:"Operaciones de música",workersOnline:"bots de música en línea",upNext:"A continuación",tracks:"pistas",voiceWorkers:"Bots de voz",liveHealth:"estado en vivo",audioFilters:"Filtros de audio",recentListening:"Escuchado recientemente",roomConfiguration:"CONFIGURACIÓN DE SALA",noRooms:"No hay salas de música configuradas.",createRoomHelp:"Crea una abajo usando los canales de Discord.",commandSent:"Comando enviado",languageSaved:"Preferencia de idioma guardada",liveLyrics:"LETRA EN VIVO",lyricsWaiting:"La letra sincronizada aparecerá aquí cuando esté disponible.",createRoom:"Crear sala de música",musicPermissions:"Permisos de música",admin:"ADMIN",roleAccess:"ACCESO POR ROL",name:"Nombre",requestChannel:"Canal de solicitudes",voiceChannel:"Canal de voz",skipPolicy:"Política de salto",autoplay:"Reproducción automática",cleanRequests:"Limpiar solicitudes",saveRule:"Guardar regla",rule:"Regla",allow:"Permitir",deny:"Denegar",discordRole:"Rol de Discord",permission:"Permiso",recommendedForYou:"Recomendado para ti",queueThis:"Añadir",trackDetails:"Detalles de la pista",didYouKnow:"¿Sabías que?"},
  ru:{
    privateControls:"Личные элементы управления",nothingPlaying:"Сейчас ничего не играет.",readyRequests:"Готов к запросам",queue:"Очередь",pause:"Пауза",resume:"Продолжить",voteSkip:"Голосовать за пропуск",lyrics:"Текст",addMusic:"Добавить музыку",filters:"Фильтры",recommendations:"Рекомендации",close:"Закрыть",more:"Ещё",controls:"Управление",requestHint:"Отправьте песню, исполнителя, плейлист, радио или аудио-URL, чтобы добавить в очередь.",inactivity:"Эта личная панель закроется через **90 секунд бездействия**.",language:"Язык",addMusicTitle:"Добавить музыку",addMusicLabel:"Песня, исполнитель, плейлист, поток или URL",addMusicPlaceholder:"например, Metallica Enter Sandman",nowPlaying:"СЕЙЧАС ИГРАЕТ",musicOperations:"Управление музыкой",workersOnline:"музыкальных ботов онлайн",upNext:"Далее",tracks:"треков",voiceWorkers:"Голосовые боты",liveHealth:"состояние",audioFilters:"Аудиофильтры",recentListening:"Недавние прослушивания",roomConfiguration:"НАСТРОЙКИ КОМНАТЫ",noRooms:"Музыкальные комнаты не настроены.",createRoomHelp:"Создайте комнату ниже, выбрав каналы Discord.",commandSent:"Команда отправлена",languageSaved:"Язык сохранён",liveLyrics:"ТЕКСТ В РЕАЛЬНОМ ВРЕМЕНИ",lyricsWaiting:"Синхронизированный текст появится здесь, когда будет доступен.",createRoom:"Создать музыкальную комнату",musicPermissions:"Права музыки",admin:"АДМИН",roleAccess:"ДОСТУП ПО РОЛЯМ",name:"Название",requestChannel:"Канал запросов",voiceChannel:"Голосовой канал",skipPolicy:"Правило пропуска",autoplay:"Автовоспроизведение",cleanRequests:"Удалять запросы",saveRule:"Сохранить правило",rule:"Правило",allow:"Разрешить",deny:"Запретить",discordRole:"Роль Discord",permission:"Право",recommendedForYou:"Рекомендовано вам",queueThis:"В очередь",trackDetails:"Информация о треке",didYouKnow:"Знаете ли вы?"},
  ko:{
    privateControls:"개인 음악 컨트롤",nothingPlaying:"현재 재생 중인 음악이 없습니다.",readyRequests:"요청 대기 중",queue:"대기열",pause:"일시정지",resume:"재생",voteSkip:"스킵 투표",lyrics:"가사",addMusic:"음악 추가",filters:"필터",recommendations:"추천",close:"닫기",more:"더보기",controls:"컨트롤",requestHint:"노래, 아티스트, 재생목록, 라디오 또는 오디오 URL을 입력해 대기열에 추가하세요.",inactivity:"이 개인 패널은 **90초 동안 상호작용이 없으면** 자동으로 닫힙니다.",language:"언어",addMusicTitle:"음악 추가",addMusicLabel:"노래, 아티스트, 재생목록, 스트림 또는 URL",addMusicPlaceholder:"예: Metallica Enter Sandman",nowPlaying:"현재 재생 중",musicOperations:"음악 운영",workersOnline:"음악 봇 온라인",upNext:"다음 곡",tracks:"곡",voiceWorkers:"음성 봇",liveHealth:"실시간 상태",audioFilters:"오디오 필터",recentListening:"최근 재생",roomConfiguration:"룸 설정",noRooms:"설정된 음악 룸이 없습니다.",createRoomHelp:"아래에서 Discord 채널을 선택해 생성하세요.",commandSent:"명령을 보냈습니다",languageSaved:"언어 설정을 저장했습니다",liveLyrics:"실시간 가사",lyricsWaiting:"동기화 가사를 사용할 수 있으면 여기에 표시됩니다.",createRoom:"음악 룸 만들기",musicPermissions:"음악 권한",admin:"관리",roleAccess:"역할 접근",name:"이름",requestChannel:"요청 채널",voiceChannel:"음성 채널",skipPolicy:"스킵 정책",autoplay:"자동 재생",cleanRequests:"요청 메시지 정리",saveRule:"규칙 저장",rule:"규칙",allow:"허용",deny:"거부",discordRole:"Discord 역할",permission:"권한",recommendedForYou:"추천 음악",queueThis:"대기열 추가",trackDetails:"트랙 정보",didYouKnow:"알고 계셨나요?"},
  "zh-CN":{
    privateControls:"私人音乐控制",nothingPlaying:"当前没有正在播放的音乐。",readyRequests:"等待音乐请求",queue:"队列",pause:"暂停",resume:"继续",voteSkip:"投票跳过",lyrics:"歌词",addMusic:"添加音乐",filters:"音效",recommendations:"推荐",close:"关闭",more:"更多",controls:"控制面板",requestHint:"发送歌曲、歌手、播放列表、电台或音频链接即可加入队列。",inactivity:"此私人面板在 **90 秒无操作** 后自动关闭。",language:"语言",addMusicTitle:"添加音乐",addMusicLabel:"歌曲、歌手、播放列表、音频流或链接",addMusicPlaceholder:"例如：Metallica Enter Sandman",nowPlaying:"正在播放",musicOperations:"音乐控制中心",workersOnline:"音乐机器人在线",upNext:"接下来",tracks:"首",voiceWorkers:"语音机器人",liveHealth:"实时状态",audioFilters:"音频滤镜",recentListening:"最近播放",roomConfiguration:"房间设置",noRooms:"尚未配置音乐房间。",createRoomHelp:"在下方选择 Discord 频道来创建。",commandSent:"命令已发送",languageSaved:"语言偏好已保存",liveLyrics:"实时歌词",lyricsWaiting:"可用时，同步歌词会显示在这里。",createRoom:"创建音乐房间",musicPermissions:"音乐权限",admin:"管理",roleAccess:"角色权限",name:"名称",requestChannel:"点歌频道",voiceChannel:"语音频道",skipPolicy:"跳过规则",autoplay:"自动播放",cleanRequests:"清理点歌消息",saveRule:"保存规则",rule:"规则",allow:"允许",deny:"拒绝",discordRole:"Discord 角色",permission:"权限",recommendedForYou:"为你推荐",queueThis:"加入队列",trackDetails:"歌曲信息",didYouKnow:"你知道吗？"}
};

export function normalizeLocale(locale?:string|null){
  if(!locale)return "en-US";
  if(LANGUAGES.some(l=>l.value===locale))return locale;
  const base=locale.split("-")[0];
  const supported=LANGUAGES.find(l=>l.value===base || l.value.startsWith(`${base}-`));
  return supported?.value??"en-US";
}
export function tr(locale:string|undefined|null,key:string){
  const l=normalizeLocale(locale);
  const base=l.split("-")[0];
  return STRINGS[l]?.[key]??STRINGS[base]?.[key]??STRINGS["en-US"][key]??key;
}
export {applyWikiOverrides,wikiGuideText,canonicalWikiShipKey} from './wikiKnowledge.js';

export {mergeWikiRecordData,wikiRecordIsHistorical,wikiRecordPriority,wikiNumber,wikiKnownValue} from './wikiRecordMerge.js';
export * from './territory.js';

export * from './guildCatalogue.js';

export * from './dmControls.js';
export * from './leaveDates.js';
export * from './diplomacy.js';
export * from './musicRanking.js';
export * from './eventTool.js';
export * from './allianceAccess.js';

export * from "./eventProgress.js";

export * from "./eventShop.js";

export * from "./eventEconomy.js";

export * from './eventDonations.js';

export * from './eventRewards.js';

export * from './eventPresentation.js';

export * from './eventRanks.js';

export * from './pbPresentation.js';
export * from './wikiVisuals.js';
export * from './wikiPlanning.js';
