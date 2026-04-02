import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import treeKill from 'tree-kill';
import path from 'path';
import log from 'electron-log';

export class SidecarManager {
  private process: ChildProcess | null = null;
  private readonly backendPath: string;
  private readonly isDev: boolean;
  private readonly healthUrl = 'http://127.0.0.1:8765/health';
  private lastStdoutLines: string[] = [];
  private lastStderrLines: string[] = [];
  private currentCommand = '';

  constructor(backendPath: string, isDev: boolean) {
    this.backendPath = backendPath;
    this.isDev = isDev;

    log.transports.file.level = 'info';
    log.info('SidecarManager initialized with backendPath:', backendPath, 'isDev:', isDev);
  }

  async start(): Promise<void> {
    let command: string;
    let args: string[];

    if (this.isDev) {
      command = process.platform === 'win32' ? 'python' : 'python3';
      args = ['main.py'];
    } else {
      const exeName = process.platform === 'win32' ? 'backend.exe' : 'backend';
      command = path.join(this.backendPath, exeName);
      args = [];
    }

    this.lastStdoutLines = [];
    this.lastStderrLines = [];
    this.currentCommand = `${command} ${args.join(' ')}`.trim();

    log.info('Starting sidecar process:', this.currentCommand);
    log.info('Sidecar working directory:', this.backendPath);
    log.info('Sidecar startup diagnostics:\n' + this.getStartupDiagnostics());

    if (!this.isDev && !fs.existsSync(command)) {
      throw new Error(`Packaged backend executable not found: ${command}\n${this.getStartupDiagnostics()}`);
    }

    try {
      this.process = spawn(command, args, {
        cwd: this.backendPath,
        stdio: 'pipe',
        shell: false,
        detached: true,
        env: {
          ...process.env,
          PORT: '8765',
          HOST: '127.0.0.1',
          PYTHONUNBUFFERED: '1',
          SECOND_BRAIN_ELECTRON_SIDECAR: '1',
          SECOND_BRAIN_DISABLE_BROWSER: '1',
          SECOND_BRAIN_DISABLE_HOTKEYS: '1',
        },
      });
    } catch (err) {
      log.error('Synchronous error during spawn:', err);
      throw this.wrapStartupError(err);
    }

    this.attachOutputLogging();

    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(this.wrapStartupError(error));
      };

      this.process?.once('spawn', () => {
        log.info('Backend process spawned successfully. pid=', this.process?.pid ?? 'unknown');
        this.waitForBackendReady().then(resolveOnce).catch(rejectOnce);
      });

      this.process?.once('error', (err) => {
        log.error('Backend process emitted error event:', err);
        rejectOnce(err);
      });

      this.process?.once('exit', (code, signal) => {
        log.warn(`Backend process exited with code ${code} and signal ${signal}`);
        if (!settled) {
          rejectOnce(new Error(`Backend exited before becoming ready (code=${code}, signal=${signal})`));
        }
      });
    });
  }

  private attachOutputLogging(): void {
    if (this.process?.stdout) {
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this.captureLines(this.lastStdoutLines, output);
        const trimmed = output.trim();
        if (trimmed) {
          log.info(`[Backend STDOUT] ${trimmed}`);
        }
      });
    }

    if (this.process?.stderr) {
      this.process.stderr.on('data', (data) => {
        const output = data.toString();
        this.captureLines(this.lastStderrLines, output);
        const trimmed = output.trim();
        if (trimmed) {
          log.error(`[Backend STDERR] ${trimmed}`);
        }
      });
    }
  }

  private captureLines(target: string[], chunk: string): void {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      target.push(trimmed);
      if (target.length > 20) {
        target.splice(0, target.length - 20);
      }
    }
  }

  private async waitForBackendReady(retries = 12): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(this.healthUrl, { signal: controller.signal as AbortSignal });
        clearTimeout(timeoutId);

        if (response.ok) {
          log.info(`Backend health check succeeded on attempt ${i + 1}/${retries}`);
          return;
        }

        log.warn(`Backend health check returned ${response.status} on attempt ${i + 1}/${retries}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`Backend health check failed on attempt ${i + 1}/${retries}: ${message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Backend failed health check at ${this.healthUrl} after ${retries} attempts.`);
  }

  private wrapStartupError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${message}\n${this.getStartupDiagnostics()}`);
  }

  private getStartupDiagnostics(): string {
    const backendPathExists = fs.existsSync(this.backendPath);
    let backendEntries = 'unavailable';

    if (backendPathExists) {
      try {
        backendEntries = fs.readdirSync(this.backendPath).slice(0, 20).join(', ') || '(empty)';
      } catch (error) {
        backendEntries = `failed to read: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const lines = [
      `platform=${process.platform}`,
      `pid=${process.pid}`,
      `backendPath=${this.backendPath}`,
      `backendPathExists=${backendPathExists}`,
      `backendEntries=${backendEntries}`,
      `command=${this.currentCommand || '(not prepared)'}`,
      `processPid=${this.process?.pid ?? 'not-started'}`,
      `lastStdout=${this.lastStdoutLines.length ? this.lastStdoutLines.join(' | ') : '(empty)'}`,
      `lastStderr=${this.lastStderrLines.length ? this.lastStderrLines.join(' | ') : '(empty)'}`,
    ];

    return lines.join('\n');
  }

  async stop(): Promise<void> {
    if (this.process?.pid) {
      log.info('Killing sidecar process using tree-kill...');
      try {
        await new Promise<void>((resolve, reject) => {
          treeKill(this.process!.pid!, 'SIGKILL', (err) => {
            if (err) {
              log.error('tree-kill error:', err);
              reject(err);
            } else {
              log.info('Sidecar process tree killed successfully.');
              resolve();
            }
          });
        });
      } catch (e) {
        log.error('Failed to kill sidecar gracefully, forcing kill...', e);
        this.process.kill('SIGKILL');
      }
      this.process = null;
      this.currentCommand = '';
    }
  }

  isAlive(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
