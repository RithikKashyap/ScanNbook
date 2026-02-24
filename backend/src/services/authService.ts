import User from '../models/user';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

class AuthService {
    async register(userData: any) {
        const { username, email, password } = userData;
        
        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            throw new Error('User already exists with this email or username');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ 
            username, 
            email, 
            password: hashedPassword 
        });
        
        // Remove password from response
        const userResponse = newUser.toObject();
        delete (userResponse as any).password;
        
        return userResponse;
    }

    async authenticate(email: string, password: string) {
        const user = await User.findOne({ email });
        
        if (!user) {
            throw new Error('Invalid credentials');
        }
        
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign(
            { id: user._id, email: user.email }, 
            process.env.JWT_SECRET || 'fallback_secret', 
            { expiresIn: '24h' }
        );
        
        return token;
    }
}

export default AuthService;