/**
 * Shared error-handling wrapper for UI route handlers.
 *
 * Eliminates duplicated try/catch blocks across all route files.
 */

import type { Request, Response } from 'express';

type RouteHandler = (req: Request, res: Response) => void;

export function wrapHandler(handler: RouteHandler): RouteHandler {
  return (req: Request, res: Response) => {
    try {
      handler(req, res);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}
