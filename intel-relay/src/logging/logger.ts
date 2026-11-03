type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private secrets = new Set<string>();
  public constructor(private readonly minimum: LogLevel) {}
  public protect(secret: string): void { if (secret) this.secrets.add(secret); }
  private redact(text: string): string {
    for (const secret of this.secrets) text = text.split(secret).join('[REDACTED]');
    return text.replace(/(https:\/\/[^/]*discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)[\w-]+/g, '$1[REDACTED]');
  }

  public debug(message: string, meta?: unknown): void {
    this.write('debug', message, meta);
  }

  public info(message: string, meta?: unknown): void {
    this.write('info', message, meta);
  }

  public warn(message: string, meta?: unknown): void {
    this.write('warn', message, meta);
  }

  public error(message: string, meta?: unknown): void {
    this.write('error', message, meta);
  }

  private write(level: LogLevel, message: string, meta?: unknown): void {
    if (priorities[level] < priorities[this.minimum]) return;

    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      message,
    };

    if (meta !== undefined) {
      if (meta instanceof Error) {
        entry.error = {
          name: meta.name,
          message: meta.message,
          stack: meta.stack,
          ...('code' in meta ? { code: meta.code } : {}),
        };
      } else {
        entry.meta = meta;
      }
    }

    const output = this.redact(JSON.stringify(entry));
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
  }
}
