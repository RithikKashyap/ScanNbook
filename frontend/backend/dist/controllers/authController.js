"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const authService_1 = __importDefault(require("../services/authService"));
class AuthController {
    constructor() {
        this.registerUser = async (req, res) => {
            try {
                const userData = req.body;
                if (!userData.username || !userData.email || !userData.password) {
                    res.status(400).json({
                        message: 'Username, email, and password are required'
                    });
                    return;
                }
                const newUser = await this.authService.register(userData);
                res.status(201).json({
                    message: 'User registered successfully',
                    user: newUser
                });
            }
            catch (error) {
                res.status(400).json({ message: error.message });
            }
        };
        this.loginUser = async (req, res) => {
            try {
                const { email, password } = req.body;
                if (!email || !password) {
                    res.status(400).json({
                        message: 'Email and password are required'
                    });
                    return;
                }
                const token = await this.authService.authenticate(email, password);
                res.status(200).json({
                    message: 'Login successful',
                    token
                });
            }
            catch (error) {
                res.status(401).json({ message: error.message });
            }
        };
        this.authService = new authService_1.default();
    }
}
exports.default = new AuthController();
//# sourceMappingURL=authController.js.map