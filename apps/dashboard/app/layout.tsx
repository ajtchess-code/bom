import "./globals.css";
import type { Metadata } from "next";

export const metadata:Metadata={
  title:{default:"Band of Misfits - Member Portal",template:"%s · Band of Misfits"},
  icons:{icon:"/branding/defaults/bom-logo.png"},
  description:"Band of Misfits member portal for World of Sea Battles, Port Battles, Wiki, Music and server tools."
};

const themeBootstrap=`(()=>{try{const saved=localStorage.getItem("bom:theme");const theme=saved==="light"||saved==="dark"?saved:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch{document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head><body><div className="noise"/><main>{children}</main></body></html>;
}
