"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const user_1 = __importDefault(require("../models/user"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class AuthService {
    async register(userData) {
        const { username, email, password } = userData;
        const existingUser = await user_1.default.findOne({
            $or: [{ email }, { username }]
        });
        if (existingUser) {
            throw new Error('User already exists with this email or username');
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const newUser = await user_1.default.create({
            username,
            email,
            password: hashedPassword
        });
        const userResponse = newUser.toObject();
        delete userResponse.password;
        return userResponse;
    }
    async authenticate(email, password) {
        const user = await user_1.default.findOne({ email });
        if (!user) {
            throw new Error('Invalid credentials');
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid credentials');
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
        return token;
    }
}
exports.default = AuthService;
//# sourceMappingURL=authService.js.map