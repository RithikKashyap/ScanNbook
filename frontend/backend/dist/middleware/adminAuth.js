"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const requireAdminAuth = (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (!decoded || decoded.role !== 'admin') {
            res.status(401).json({ message: 'Admin authorization required' });
            return;
        }
        req.admin = decoded;
        next();
    }
    catch {
        res.status(401).json({ message: 'Admin authorization required' });
    }
};
exports.requireAdminAuth = requireAdminAuth;
//# sourceMappingURL=adminAuth.js.map