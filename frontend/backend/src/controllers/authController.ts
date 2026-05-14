import { Request, Response } from 'express';
import AuthService from '../services/authService';

class AuthController {
    private authService: AuthService;

    constructor() {
        this.authService = new AuthService();
    }

    public registerUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const userData = req.body;
            
            // Validate required fields
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
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    };

    public loginUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const { email, password } = req.body;
            
            // Validate required fields
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
        } catch (error: any) {
            res.status(401).json({ message: error.message });
        }
    };
}

export default new AuthController();