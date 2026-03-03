import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

type AdminTokenPayload = jwt.JwtPayload & {
  role?: string;
  username?: string;
};

export interface AdminAuthRequest extends Request {
  admin?: AdminTokenPayload;
}

export const requireAdminAuth = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ message: 'Admin authorization required' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ message: 'Admin authorization required' });
    return;
  }

  try {
    const secret = String(process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'change-this-admin-secret');
    const decoded = jwt.verify(token, secret) as AdminTokenPayload;
    if (!decoded || decoded.role !== 'admin') {
      res.status(401).json({ message: 'Admin authorization required' });
      return;
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Admin authorization required' });
  }
};
