export function startInstall(tag:string):Promise<any>;
export function nextInstall(tag:string):Promise<any>;
export function installLocal(manifestPath:string):Promise<any>;
export function extractCheckedZip(buffer:Buffer,directory:string):Promise<number>;
export function validateManifest(manifest:any):any;
