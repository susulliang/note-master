#!/usr/bin/env node
/**
 * Dev launcher: 启动 vite dev server，把 stdout/stderr 加时间戳前缀
 * 写到 logs/<name>.std.log + 当前 stdout；负责子进程组管理与端口孤儿清理。
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const LOG_DIR = process.env.LOG_DIR || 'logs';
const CLIENT_DEV_PORT = process.env.CLIENT_DEV_PORT || '8001';

fs.mkdirSync(LOG_DIR, { recursive: true });

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

function log(msg) {
  const line = `[${timestamp()}] [dev] ${msg}\n`;
  try { process.stdout.write(line); } catch {}
}

/** 清理端口占用：Unix lsof / Windows netstat+taskkill */
function killOrphansByPort(port) {
  const isWin = process.platform === 'win32';
  try {
    let pids = [];
    if (isWin) {
      const out = execSync(
        `netstat -ano | findstr :${port}`,
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
        .toString()
        .trim();
      if (out) {
        const seen = new Set();
        for (const line of out.split('\n')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !seen.has(pid)) { seen.add(pid); pids.push(pid); }
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
          log(`killed orphan pid=${pid} on :${port}`);
        } catch {}
      }
    } else {
      const out = execSync(`lsof -ti:${port}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (!out) return [];
      pids = out.split('\n').filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGKILL');
          log(`killed orphan pid=${pid} on :${port}`);
        } catch {}
      }
    }
    return pids;
  } catch {
    return [];
  }
}

const managed = [];

function startProcess({ name, command, args, logFileName }) {
  const logFd = logFileName
    ? fs.openSync(path.join(LOG_DIR, logFileName), 'a')
    : null;

  const isWin = process.platform === 'win32';
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
    cwd: ROOT,
    env: process.env,
    detached: !isWin,
  });

  const pipeLines = (stream) => {
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const msg = `[${timestamp()}] [${name}] ${line}\n`;
      try { process.stdout.write(msg); } catch {}
      if (logFd != null) {
        try { fs.writeSync(logFd, msg); } catch {}
      }
    });
  };
  pipeLines(child.stdout);
  pipeLines(child.stderr);

  managed.push({ name, child });
  return child;
}

killOrphansByPort(CLIENT_DEV_PORT);

// Cross-platform vite launch: bypass npx (unreliable on some Windows Node installs)
// by invoking vite's bin script directly via node.
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
startProcess({
  name: 'client',
  command: process.execPath,
  args: [viteBin, '--port', CLIENT_DEV_PORT, '--host', '0.0.0.0'],
  logFileName: 'client.std.log',
});

let stopping = false;
function cleanup(signal) {
  if (stopping) return;
  stopping = true;
  log(`cleanup triggered by ${signal}`);

  const isWin = process.platform === 'win32';
  for (const { child } of managed) {
    if (!child.pid) continue;
    try {
      if (isWin) {
        execSync(`taskkill /F /PID ${child.pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, signal || 'SIGTERM');
      }
    } catch {}
  }
  setTimeout(() => {
    for (const { child } of managed) {
      if (!child.pid) continue;
      try {
        if (isWin) {
          execSync(`taskkill /F /PID ${child.pid} /T`, { stdio: 'ignore' });
        } else {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {}
    }
    killOrphansByPort(CLIENT_DEV_PORT);
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', () => cleanup('SIGTERM'));
process.on('SIGTERM', () => cleanup('SIGTERM'));
// pkill 杀父 npm 后会收 SIGHUP（controlling tty 关闭）；
// Node 默认直接退出不跑 handler，注册 handler 触发 cleanup
if (process.platform !== 'win32') {
  process.on('SIGHUP', () => cleanup('SIGTERM'));
}

Promise.race(
  managed.map(({ child }) => new Promise((r) => child.on('exit', r))),
).then(() => cleanup('SIGTERM'));
