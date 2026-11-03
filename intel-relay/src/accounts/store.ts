import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export interface SubRelay {policy?:import('../relay/policy.js').RoutePolicy;paused?:boolean;pausedUntil?:number;id:string;name:string;guildId:string;webhook:string;voiceWebhook:string;channels:string[];excludedChannels:string[];enabled:boolean;autoChannels?:boolean;ignoreBots?:boolean;}
export interface Account {
  policy?:import('../relay/policy.js').RoutePolicy;paused?:boolean;pausedUntil?:number;
  monitoredGuildIds?:string[]|undefined; autoChannels?: boolean; guildId?: string; subRelays?: SubRelay[];
  id: string; name: string; token: string; webhook: string; voiceWebhook: string;
  channels: string[]; excludedChannels: string[]; voiceGuilds: string[]; ignoreBots: boolean; enabled: boolean;
}
export class AccountStore {
  private key: Buffer;
  private file: string;
  public constructor(public readonly directory: string) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'accounts.enc');
    const keyFile = path.join(directory, 'accounts.key');
    if (!fs.existsSync(keyFile)) {
      if (fs.existsSync(this.file)) throw new Error('Account encryption key is missing. Restore accounts.key from backup.');
      fs.writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
    }
    this.key = fs.readFileSync(keyFile);
    if (this.key.length !== 32) throw new Error('Invalid account encryption key.');
  }
  public load(): Account[] {
    if (!fs.existsSync(this.file)) return [];
    const raw = fs.readFileSync(this.file);
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString()) as Account[];
  }
  public saveRevision(id:number,account:Account):void {
    const file=path.join(this.directory,'config-history.enc');let history:any[]=[];
    if(fs.existsSync(file)){const raw=fs.readFileSync(file),decipher=createDecipheriv('aes-256-gcm',this.key,raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));history=JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString());}
    history.push({id,account});history=history.slice(-500);
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce),bytes=Buffer.concat([cipher.update(JSON.stringify(history)),cipher.final()]);
    fs.writeFileSync(file+'.tmp',Buffer.concat([nonce,cipher.getAuthTag(),bytes]),{mode:0o600});fs.renameSync(file+'.tmp',file);
  }
  public revision(id:number):Account|null {
    const file=path.join(this.directory,'config-history.enc');if(!fs.existsSync(file))return null;
    const raw=fs.readFileSync(file),decipher=createDecipheriv('aes-256-gcm',this.key,raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));
    const history=JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString());return history.find((entry:any)=>entry.id===id)?.account??null;
  }
  public save(accounts: Account[]): void {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(accounts)), cipher.final()]);
    fs.writeFileSync(`${this.file}.tmp`, Buffer.concat([nonce, cipher.getAuthTag(), bytes]), { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
  }
}
