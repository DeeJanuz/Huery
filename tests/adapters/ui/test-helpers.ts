/**
 * Shared test utilities for UI route tests.
 *
 * Provides an HTTP request helper that spins up a temporary Express server
 * and issues real HTTP requests using node:http — zero extra dependencies.
 */

import http from 'node:http';
import type { Express } from 'express';

export interface TestResponse {
  status: number;
  body: unknown;
}

/**
 * Issue a GET request against an Express app on an ephemeral port.
 * The server is closed automatically after the response is received.
 */
export function request(app: Express, path: string): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }

      const port = addr.port;
      http.get(`http://localhost:${port}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode!, body: data });
          }
        });
        res.on('error', (err) => {
          server.close();
          reject(err);
        });
      }).on('error', (err) => {
        server.close();
        reject(err);
      });
    });
  });
}
