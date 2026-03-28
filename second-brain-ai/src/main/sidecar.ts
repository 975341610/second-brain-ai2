import { spawn, ChildProcess } from 'child_process';
import treeKill from 'tree-kill';
import path from 'path';

export class SidecarManager {
  private process: ChildProcess | null = null;
  private backendPath: string;
  private isDev: boolean;

  constructor(backendPath: string, isDev: boolean) {
    this.backendPath = backendPath;
    this.isDev = isDev;
  }

  async start(): Promise<void> {
    let command: string;
    let args: string[];

    if (this.isDev) {
      command = process.platform === 'win32' ? 'python' : 'python3';
      args = ['main.py'];
    } else {
      // 生产环境下，执行打包好的 backend 可执行文件
      // 根据 package.json 的 extraResources，它在 process.resourcesPath/backend 目录下
      const exeName = process.platform === 'win32' ? 'backend.exe' : 'backend';
      command = path.join(this.backendPath, exeName);
      args = [];
    }

    this.process = spawn(command, args, {
      cwd: this.backendPath,
      stdio: 'inherit',
      shell: true,
      detached: true,
      env: {
        ...process.env,
        PORT: '8765',
        HOST: '127.0.0.1'
      }
    });

    return new Promise((resolve, reject) => {
      this.process?.on('spawn', () => {
        // 等待后端启动就绪 (简单轮询健康检查)
        this.waitForBackendReady().then(resolve).catch(reject);
      });
      this.process?.on('error', (err) => reject(err));
    });
  }

  private async waitForBackendReady(retries = 10): Promise<void> {
    const healthUrl = 'http://127.0.0.1:8765/health'; // 假设后端有 /health 接口
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(healthUrl);
        if (response.ok) return;
      } catch (e) {
        // ignore
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Backend failed to start after multiple retries');
  }

  async stop(): Promise<void> {
    if (this.process?.pid) {
      try {
        // 使用负 PID 杀死进程组 (前提是开启了 detached)
        process.kill(-this.process.pid, 'SIGTERM');
      } catch (e) {
        // 如果失败，尝试常规杀死
        this.process.kill();
      }
      this.process = null;
    }
  }

  isAlive(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
