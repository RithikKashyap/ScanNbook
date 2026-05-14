"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const index_1 = __importDefault(require("./routes/index"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',');
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', (0, cors_1.default)());
app.use(express_1.default.json({ limit: '25mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '25mb' }));
mongoose_1.default.connect(process.env.DATABASE_URL || 'mongodb+srv://scannbook:Rithik8000@cluster0.wxdm1xh.mongodb.net/?appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
    console.log('✅ Connected to MongoDB database');
})
    .catch((err) => {
    console.error(' Database connection error:', err);
    process.exit(1);
});
app.use('/api', index_1.default);
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
app.use('*', (req, res) => {
    res.status(404).json({
        message: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});
app.use((err, req, res, next) => {
    console.error(' Server error:', err);
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'production' ? err.message : 'Something went wrong'
    });
});
app.listen(PORT, () => {
    console.log(` Server is running on http://localhost:${PORT}`);
    console.log(` API documentation available at http://localhost:${PORT}/api/health`);
});
exports.default = app;
//# sourceMappingURL=index.js.map