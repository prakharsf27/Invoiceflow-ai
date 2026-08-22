import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User.js';

export const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET?.trim();

    if (!secret) {
        throw new Error('JWT_SECRET environment variable is not configured');
    }

    return secret;
};

export const JWT_SECRET = getJwtSecret();

export interface AuthUserPayload {
  userId: string;
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  companyName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

/**
 * Authentication middleware to verify JWT token and enforce company-level data isolation.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Bearer token.',
      });
      return;
    }

    const token = authHeader.split(' ')[1]?.trim();
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication token is empty.',
      });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token. Please log in again.',
      });
      return;
    }

    if (!decoded || !decoded.userId || !decoded.companyId) {
      res.status(401).json({
        success: false,
        error: 'Malformed token payload. Authentication denied.',
      });
      return;
    }

    // Attach verified user and company context to request
    req.user = {
      userId: decoded.userId,
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role || 'finance_admin',
      companyId: decoded.companyId,
      companyName: decoded.companyName || 'Company',
    };

    next();
  } catch (error: any) {
    console.error('❌ Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication processing error',
    });
  }
};
