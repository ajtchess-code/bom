// Server-only setup: supply Fontconfig on minimal Node hosting images.
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const bundled=fileURLToPath(new URL('../assets/fonts/fonts.conf',import.meta.url));
if(existsSync(bundled)&&(!process.env.FONTCONFIG_FILE||!existsSync(process.env.FONTCONFIG_FILE))){
 process.env.FONTCONFIG_FILE=bundled;
 process.env.FONTCONFIG_PATH=dirname(bundled);
}
