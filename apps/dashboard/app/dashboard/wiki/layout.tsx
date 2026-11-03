import {WikiHeader} from '@/components/WikiReader';
export default function WikiLayout({children}:{children:React.ReactNode}){return <div className="encyclopedia"><WikiHeader/>{children}</div>}
