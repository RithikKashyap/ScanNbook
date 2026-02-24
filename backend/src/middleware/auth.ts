import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user';

interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            res.status(401).json({ message: 'Access token required' });
            return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
        
        // Fetch user details
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            res.status(401).json({ message: 'Invalid token - user not found' });
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(403).json({ message: 'Invalid or expired token' });
        return;
    }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
            const user = await User.findById(decoded.id).select('-password');
            req.user = user;
        }
        
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};