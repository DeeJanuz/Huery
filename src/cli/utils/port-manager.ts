/**
 * Port management utilities for checking port availability and killing processes.
 *
 * Uses a ProcessDiscovery strategy for platform abstraction and testability.
 */

import net from 'node:net';
import { execSync } from 'node:child_process';

/**
 * Strategy interface for process discovery operations.
 * Abstracts platform-specific process lookup and signal delivery.
 */
export interface ProcessDiscovery {
  findPidOnPort(port: number): number | null;
  killProcess(pid: number, signal: NodeJS.Signals): void;
  isProcessAlive(pid: number): boolean;
}

/**
 * Default ProcessDiscovery implementation using lsof and process.kill.
 * Works on Linux and macOS.
 */
export const defaultProcessDiscovery: ProcessDiscovery = {
  findPidOnPort(port: number): number | null {
    try {
      const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim();
      if (!output) return null;
      const numericPid = Number(output.split('\n')[0]);
      return isNaN(numericPid) ? null : numericPid;
    } catch {
      return null;
    }
  },

  killProcess(pid: number, signal: NodeJS.Signals): void {
    process.kill(pid, signal);
  },

  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
};

interface KillOptions {
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Check if a port is in use by attempting to bind to it.
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port);
  });
}

/**
 * Wait for a process to exit by polling isProcessAlive.
 */
function waitForExit(
  pid: number,
  timeoutMs: number,
  discovery: ProcessDiscovery,
  pollIntervalMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = (): void => {
      if (!discovery.isProcessAlive(pid)) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, pollIntervalMs);
      }
    };
    check();
  });
}

/**
 * Check if a port is in use and kill the process using it.
 * Returns true if a process was killed, false if port was free or kill failed.
 */
export async function killProcessOnPort(
  port: number,
  discovery: ProcessDiscovery = defaultProcessDiscovery,
  options: KillOptions = {},
): Promise<boolean> {
  const { waitTimeoutMs = 2000, pollIntervalMs = 100 } = options;

  const inUse = await isPortInUse(port);
  if (!inUse) {
    return false;
  }

  const pid = discovery.findPidOnPort(port);
  if (pid === null) {
    return false;
  }

  console.log(`Stopping existing heury ui on port ${port} (PID ${pid})...`);

  try {
    discovery.killProcess(pid, 'SIGTERM');
  } catch {
    return false;
  }

  const exited = await waitForExit(pid, waitTimeoutMs, discovery, pollIntervalMs);
  if (!exited) {
    try {
      discovery.killProcess(pid, 'SIGKILL');
    } catch {
      // Process may have already exited
    }
  }

  return true;
}
