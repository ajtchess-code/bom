import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// Resolve both source (tsx) and dist layouts, independently of the working directory.
const bundled=[new URL('../../../assets/fonts/fonts.conf',import.meta.url),new URL('../../assets/fonts/fonts.conf',import.meta.url)].map(url=>fileURLToPath(url)).find(existsSync);
if(bundled)process.env.FONTCONFIG_FILE=bundled;
