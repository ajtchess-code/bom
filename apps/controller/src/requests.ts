export type RequestKind="spotify"|"apple"|"deezer"|"tidal"|"youtube"|"soundcloud"|"radio"|"audio"|"url"|"text";
export function classify(input:string):{kind:RequestKind;query:string}{
  const s=input.trim();
  if(/open\.spotify\.com/i.test(s))return{kind:"spotify",query:s};
  if(/music\.apple\.com/i.test(s))return{kind:"apple",query:s};
  if(/deezer\.com/i.test(s))return{kind:"deezer",query:s};
  if(/tidal\.com/i.test(s))return{kind:"tidal",query:s};
  if(/youtu(be\.com|\.be)/i.test(s))return{kind:"youtube",query:s};
  if(/soundcloud\.com/i.test(s))return{kind:"soundcloud",query:s};
  if(/^https?:\/\/.+\.(mp3|ogg|opus|wav|flac|m4a)(\?.*)?$/i.test(s))return{kind:"audio",query:s};
  if(/^https?:\/\//i.test(s)&&/(radio|stream|listen|live|\.m3u8?|\.pls)/i.test(s))return{kind:"radio",query:s};
  if(/^https?:\/\//i.test(s))return{kind:"url",query:s};
  return{kind:"text",query:s};
}
