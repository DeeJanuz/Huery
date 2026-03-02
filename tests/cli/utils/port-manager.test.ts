import { describe, it, expect, beforeEach } from 'vitest';
import net from 'node:net';

import {
  killProcessOnPort,
  isPortInUse,
  type ProcessDiscovery,
} from '@/cli/utils/port-manager.js';

function createMockDiscovery(overrides: Partial<ProcessDiscovery> = {}): ProcessDiscovery {
  return {
    findPidOnPort: overrides.findPidOnPort ?? (() => null),
    killProcess: overrides.killProcess ?? (() => {}),
    isProcessAlive: overrides.isProcessAlive ?? (() => false),
  };
}

describe('killProcessOnPort', () => {
  it('should return false when port is free', async () => {
    // Use a port that is definitely not in use
    const discovery = createMockDiscovery();
    const result = await killProcessOnPort(0, discovery);
    expect(result).toBe(false);
  });

  it('should return false when port is in use but findPidOnPort returns null', async () => {
    // Start a server to occupy a port
    const server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve((addr as net.AddressInfo).port);
      });
    });

    try {
      const discovery = createMockDiscovery({
        findPidOnPort: () => null,
      });

      const result = await killProcessOnPort(port, discovery);
      expect(result).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should return true when SIGTERM succeeds and process exits', async () => {
    const server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve((addr as net.AddressInfo).port);
      });
    });

    try {
      let killed = false;
      const discovery = createMockDiscovery({
        findPidOnPort: () => 12345,
        killProcess: () => {
          killed = true;
        },
        // After kill, process is no longer alive
        isProcessAlive: () => {
          if (killed) return false;
          return true;
        },
      });

      const result = await killProcessOnPort(port, discovery);
      expect(result).toBe(true);
      expect(killed).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should SIGKILL when SIGTERM times out and process does not exit', async () => {
    const server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve((addr as net.AddressInfo).port);
      });
    });

    try {
      const signals: string[] = [];
      let forceKilled = false;
      const discovery = createMockDiscovery({
        findPidOnPort: () => 99999,
        killProcess: (_pid, signal) => {
          signals.push(signal);
          if (signal === 'SIGKILL') {
            forceKilled = true;
          }
        },
        // Process stays alive until SIGKILL
        isProcessAlive: () => !forceKilled,
      });

      const result = await killProcessOnPort(port, discovery, {
        waitTimeoutMs: 200,
        pollIntervalMs: 50,
      });
      expect(result).toBe(true);
      expect(signals).toContain('SIGTERM');
      expect(signals).toContain('SIGKILL');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should return false when SIGTERM throws (invalid PID)', async () => {
    const server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve((addr as net.AddressInfo).port);
      });
    });

    try {
      const discovery = createMockDiscovery({
        findPidOnPort: () => 12345,
        killProcess: () => {
          throw new Error('ESRCH: no such process');
        },
      });

      const result = await killProcessOnPort(port, discovery);
      expect(result).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('isPortInUse', () => {
  it('should return true when a server is listening on the port', async () => {
    const server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve((addr as net.AddressInfo).port);
      });
    });

    try {
      const result = await isPortInUse(port);
      expect(result).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should return false when no server is listening on the port', async () => {
    // Find a free port by binding and immediately closing
    const server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve((addr as net.AddressInfo).port);
      });
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const result = await isPortInUse(port);
    expect(result).toBe(false);
  });
});
