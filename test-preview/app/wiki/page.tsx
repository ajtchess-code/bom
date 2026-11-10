import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import GameWiki from '../../../apps/dashboard/components/GameWiki';
import '../../../apps/dashboard/app/globals.css';
import '../../../apps/dashboard/app/dashboard/wiki/game-wiki.css';
export const dynamic='force-dynamic';
export default async function WikiPreview(){const catalog=JSON.parse(await readFile(resolve(process.cwd(),'../data/wiki-v2/catalog.json'),'utf8'));return <GameWiki catalog={catalog} admin/>;}
