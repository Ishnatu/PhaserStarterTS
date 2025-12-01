import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import { logSecurityEvent } from '../securityMonitor';

function formatZodErrors(issues: ZodIssue[]): { field: string; message: string }[] {
  return issues.map(e => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const userId = (req as any).user?.claims?.sub || 'anonymous';
        const ip = req.ip || 'unknown';
        
        logSecurityEvent('VALIDATION_FAILED', 'MEDIUM', {
          path: req.path,
          method: req.method,
          errors: formatZodErrors(error.issues),
        }, userId, ip);
        
        return res.status(400).json({
          message: 'Invalid request data',
          errors: formatZodErrors(error.issues),
        });
      }
      
      console.error('Unexpected validation error:', error);
      return res.status(500).json({ message: 'Internal validation error' });
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.query);
      req.query = parsed as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: 'Invalid query parameters',
          errors: formatZodErrors(error.issues),
        });
      }
      
      return res.status(500).json({ message: 'Internal validation error' });
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.params);
      req.params = parsed as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: 'Invalid path parameters',
          errors: formatZodErrors(error.issues),
        });
      }
      
      return res.status(500).json({ message: 'Internal validation error' });
    }
  };
}

export function sanitizeErrorResponse(error: any): { message: string } {
  if (error instanceof Error) {
    if (process.env.NODE_ENV === 'production') {
      return { message: 'An error occurred' };
    }
    return { message: error.message };
  }
  return { message: 'An unknown error occurred' };
}
