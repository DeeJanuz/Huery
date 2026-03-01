/**
 * Shared error-handling wrapper for UI route handlers.
 *
 * Eliminates duplicated try/catch blocks across all route files.
 */

import type { Request, Response } from 'express';

type RouteHandler = (req: Request, res: Response) => void | Promise<void>;

export function wrapHandler(handler: RouteHandler): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    try {
      const result = handler(req, res);
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}
