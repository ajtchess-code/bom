import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface RelayPartRecord {
  sourceMessageId: string;
  partIndex: number;
  sourceChannelId: string;
  sourceGuildId: string;
  destinationMessageId: string;
  createdAt: number;
  updatedAt: number;
}

interface RelayRow {
  source_message_id: string;
  part_index: number;
  source_channel_id: string;
  source_guild_id: string;
  destination_message_id: string;
  created_at: number;
  updated_at: number;
}

export class RelayDatabase {
  private readonly db: DatabaseSync;

  public constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath, { timeout: 5_000 });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS intel_archive (
        source_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        guild_name TEXT NOT NULL, channel_name TEXT NOT NULL, author TEXT NOT NULL,
        content TEXT NOT NULL, source_url TEXT NOT NULL, source_at INTEGER NOT NULL,
        received_at INTEGER NOT NULL, delivered_at INTEGER, status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
        fingerprint TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}'
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_intel_archive_time ON intel_archive(source_at);
      CREATE TABLE IF NOT EXISTS config_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, actor TEXT NOT NULL,
        snapshot TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, filters TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS relay_messages (
        source_message_id TEXT NOT NULL,
        part_index INTEGER NOT NULL,
        source_channel_id TEXT NOT NULL,
        source_guild_id TEXT NOT NULL,
        destination_message_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (source_message_id, part_index)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_relay_messages_updated_at
        ON relay_messages(updated_at);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        source_message_id TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
        ON audit_log(created_at);
    `);
  }

  public getRelayParts(sourceMessageId: string): RelayPartRecord[] {
    const rows = this.db
      .prepare(`
        SELECT source_message_id, part_index, source_channel_id, source_guild_id,
               destination_message_id, created_at, updated_at
        FROM relay_messages
        WHERE source_message_id = ?
        ORDER BY part_index ASC
      `)
      .all(sourceMessageId) as unknown as RelayRow[];

    return rows.map((row) => ({
      sourceMessageId: row.source_message_id,
      partIndex: row.part_index,
      sourceChannelId: row.source_channel_id,
      sourceGuildId: row.source_guild_id,
      destinationMessageId: row.destination_message_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  public hasRelay(sourceMessageId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS found FROM relay_messages WHERE source_message_id = ? LIMIT 1')
      .get(sourceMessageId) as { found: number } | undefined;
    return row?.found === 1;
  }

  public replaceRelayParts(
    sourceMessageId: string,
    sourceChannelId: string,
    sourceGuildId: string,
    destinationMessageIds: readonly string[],
  ): void {
    const now = Date.now();
    const existing = this.getRelayParts(sourceMessageId);
    const createdAt = existing[0]?.createdAt ?? now;

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('DELETE FROM relay_messages WHERE source_message_id = ?').run(sourceMessageId);
      const insert = this.db.prepare(`
        INSERT INTO relay_messages (
          source_message_id, part_index, source_channel_id, source_guild_id,
          destination_message_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      destinationMessageIds.forEach((destinationMessageId, partIndex) => {
        insert.run(
          sourceMessageId,
          partIndex,
          sourceChannelId,
          sourceGuildId,
          destinationMessageId,
          createdAt,
          now,
        );
      });
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  public deleteRelay(sourceMessageId: string): void {
    this.db.prepare('DELETE FROM relay_messages WHERE source_message_id = ?').run(sourceMessageId);
  }

  public getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  public setSetting(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO settings(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      .run(key, value);
  }

  public deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  public audit(event: string, sourceMessageId?: string, details?: unknown): void {
    this.db
      .prepare('INSERT INTO audit_log(event, source_message_id, details, created_at) VALUES (?, ?, ?, ?)')
      .run(event, sourceMessageId ?? null, details === undefined ? null : JSON.stringify(details), Date.now());
  }

  public recordSource(message:any,fingerprint:string,priority:number):void {
    const meta={edited:Boolean(message.editedTimestamp),editedAt:message.editedTimestamp??null,eventAt:message.editedTimestamp??message.createdTimestamp,thread:message.channel.isThread?.()?message.channel.name:null,attachments:[...message.attachments.values()].map((a:any)=>({name:a.name,url:a.url,type:a.contentType,size:a.size}))};
    this.db.prepare(`INSERT INTO intel_archive(source_id,guild_id,channel_id,guild_name,channel_name,author,content,source_url,source_at,received_at,status,priority,fingerprint,metadata)
     VALUES(?,?,?,?,?,?,?,?,?,?,'queued',?,?,?) ON CONFLICT(source_id) DO UPDATE SET content=excluded.content,fingerprint=excluded.fingerprint,priority=excluded.priority,metadata=excluded.metadata,status='queued'`)
     .run(message.id,message.guild.id,message.channel.id,message.guild.name??'Server',message.channel.name??'Channel',message.member?.displayName??message.author.globalName??message.author.username,String(message.content??'').slice(0,32000),message.url??'',message.createdTimestamp??Date.now(),Date.now(),priority,fingerprint,JSON.stringify(meta));
  }
  public sourceRecord(id:string):any{return this.db.prepare('SELECT * FROM intel_archive WHERE source_id=?').get(id)??null;}
  public sourceStatus(id:string):string|null{return (this.db.prepare('SELECT status FROM intel_archive WHERE source_id=?').get(id) as any)?.status??null;}
  public fingerprint(id:string):string|null {return (this.db.prepare('SELECT fingerprint FROM intel_archive WHERE source_id=?').get(id) as any)?.fingerprint??null;}
  public delivery(id:string,status:string,details:unknown={}):void {
    this.db.prepare("UPDATE intel_archive SET status=?,delivered_at=CASE WHEN ?='delivered' THEN ? ELSE delivered_at END WHERE source_id=?").run(status,status,Date.now(),id);
    this.audit('delivery_'+status,id,details);
  }
  public markDeleted(id:string):void {this.db.prepare("UPDATE intel_archive SET deleted=1,status='deleted' WHERE source_id=?").run(id);}
  public archiveHistory(filters:any={}) {
    const where:string[]=['1=1'],args:Array<string|number>=[];
    for(const [field,column] of [['channelId','channel_id'],['guildId','guild_id'],['status','status']] as const){if(filters[field]){where.push(column+'=?');args.push(String(filters[field]));}}
    if(filters.query){where.push("(instr(lower(content),lower(?))>0 OR instr(lower(author),lower(?))>0 OR instr(lower(channel_name),lower(?))>0)");args.push(...Array(3).fill(String(filters.query)));}
    if(filters.after){where.push('source_at>=?');args.push(Number(filters.after));}if(filters.before){where.push('source_at<=?');args.push(Number(filters.before));}
    const limit=Math.min(100,Math.max(1,Number(filters.limit)||50)),offset=Math.max(0,Number(filters.offset)||0);
    const total=(this.db.prepare('SELECT COUNT(*) AS n FROM intel_archive WHERE '+where.join(' AND ')).get(...args) as any).n;
    const rows=this.db.prepare('SELECT * FROM intel_archive WHERE '+where.join(' AND ')+' ORDER BY source_at DESC,source_id DESC LIMIT ? OFFSET ?').all(...args,limit,offset) as any[];
    return {total,rows:rows.map(row=>({...row,metadata:JSON.parse(row.metadata),destinationIds:this.getRelayParts(row.source_id).map(p=>p.destinationMessageId),destinationLinks:this.getSetting('destination_guild_id')&&this.getSetting('destination_channel_id')?this.getRelayParts(row.source_id).map(p=>`https://discord.com/channels/${this.getSetting('destination_guild_id')}/${this.getSetting('destination_channel_id')}/${p.destinationMessageId}`):[]})),offset,limit};
  }
  public deliveryHistory(limit=100,offset=0){return this.db.prepare("SELECT * FROM audit_log WHERE event LIKE 'delivery_%' OR event LIKE 'webhook_%' OR event LIKE 'voice_%' ORDER BY id DESC LIMIT ? OFFSET ?").all(Math.min(200,Math.max(1,limit)),Math.max(0,offset)).map((r:any)=>({...r,details:r.details?JSON.parse(r.details):null}));}
  public operationalSummary(days=1){
    const since=Date.now()-Math.max(1,Math.min(30,days))*86400000;
    const counts=this.db.prepare('SELECT status,COUNT(*) AS count FROM intel_archive WHERE received_at>=? GROUP BY status').all(since);
    const delay=(this.db.prepare("SELECT AVG(MAX(0,delivered_at-COALESCE(json_extract(metadata,'$.eventAt'),source_at))) AS averageMs FROM intel_archive WHERE received_at>=? AND delivered_at IS NOT NULL").get(since) as any)?.averageMs??0;
    const events=this.db.prepare('SELECT event,COUNT(*) AS count FROM audit_log WHERE created_at>=? GROUP BY event').all(since);
    return {since,counts,averageDelayMs:Math.round(Number(delay)),events};
  }
  public views(){return this.db.prepare('SELECT * FROM saved_views ORDER BY name').all().map((r:any)=>({...r,filters:JSON.parse(r.filters)}));}
  public saveView(id:string,name:string,filters:unknown){this.db.prepare('INSERT INTO saved_views VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,filters=excluded.filters').run(id,name,JSON.stringify(filters),Date.now());}
  public removeView(id:string){this.db.prepare('DELETE FROM saved_views WHERE id=?').run(id);}
  public addRevision(accountId:string,actor:string,snapshot:unknown){return Number(this.db.prepare('INSERT INTO config_revisions(account_id,actor,snapshot,created_at) VALUES(?,?,?,?)').run(accountId,actor,JSON.stringify(snapshot),Date.now()).lastInsertRowid);}
  public revisions(accountId:string){return this.db.prepare('SELECT id,actor,created_at FROM config_revisions WHERE account_id=? ORDER BY id DESC LIMIT 100').all(accountId);}
  public revision(accountId:string,id:number):any {const row=this.db.prepare('SELECT snapshot FROM config_revisions WHERE account_id=? AND id=?').get(accountId,id) as any;return row?JSON.parse(row.snapshot):null;}

  public pendingDeletes(): string[] {
    return (this.db.prepare("SELECT key FROM settings WHERE key LIKE 'delete:%'").all() as {key: string}[]).map(row => row.key.slice(7));
  }

  public cleanup(retentionDays: number): { mappings: number; audit: number } {
    
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const mappings = retentionDays <= 0 ? 0 : this.db.prepare("DELETE FROM relay_messages WHERE updated_at < ? AND source_message_id NOT IN (SELECT substr(key, 8) FROM settings WHERE key LIKE 'delete:%')").run(cutoff).changes;
    this.db.prepare('DELETE FROM intel_archive WHERE received_at < ?').run(Date.now()-30*86400000);
    const audit = this.db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(Date.now() - 30 * 86_400_000).changes;
    return { mappings: Number(mappings), audit: Number(audit) };
  }

  public close(): void {
    this.db.close();
  }
}
