import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000 ;

// CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3100', 'http://127.0.0.1:3000', 'http://127.0.0.1:3100'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
mongoose.connect(process.env.DATABASE_URL || 'mongodb+srv://scannbook:Rithik8000@cluster0.wxdm1xh.mongodb.net/?appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
} as mongoose.ConnectOptions)
.then(() => {
    console.log('✅ Connected to MongoDB database');
})
.catch((err: Error) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
});

// Routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Jharkhand Chhatriya Sangh Bhawan API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth/*',
            bookings: '/api/bookings/*',
            payments: '/api/payments/*',
            qr: '/api/qr/*'
        }
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        message: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📚 API documentation available at http://localhost:${PORT}/api/health`);
});

export default app;