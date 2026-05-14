const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const XLSX = require('xlsx');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const upload = multer({ storage: multer.memoryStorage() });
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const upiId = process.env.UPI_ID || '';
const upiPayeeName = process.env.UPI_PAYEE_NAME || 'Jharkhand Chhatriya Sangh Bhawan';
const adminUsername = String(process.env.ADMIN_USERNAME || 'admin').trim();
const adminPassword = String(process.env.ADMIN_PASSWORD || 'admin123');
const adminJwtSecret = String(process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'change-this-admin-secret');
const adminTokenTtl = String(process.env.ADMIN_TOKEN_TTL || '12h');
let razorpay = null;
if (razorpayKeyId && razorpayKeySecret) {
    razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret
    });
}

const getAdminAuthPayload = (req) => {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, adminJwtSecret);
        if (!decoded || decoded.role !== 'admin') return null;
        return decoded;
    } catch {
        return null;
    }
};

const requireAdminAuth = (req, res, next) => {
    const payload = getAdminAuthPayload(req);
    if (!payload) {
        return res.status(401).json({ message: 'Admin authorization required' });
    }
    req.admin = payload;
    next();
};

const parseBookingIdentity = (input = {}) => {
    const bookingCode = String(input.bookingCode || '').trim();
    const mobile = String(input.mobile || '').replace(/\D/g, '');
    if (!/^\d{4}$/.test(bookingCode)) {
        throw new Error('Booking code must be 4 digits');
    }
    if (mobile.length !== 10) {
        throw new Error('Mobile must be exactly 10 digits');
    }
    return { bookingCode, mobile };
};

const bookingIdentityMatches = (booking, identity) => {
    const bookingCode = String(booking?.bookingCode || '').trim();
    const mobile = String(booking?.mobile || '').replace(/\D/g, '');
    return bookingCode === identity.bookingCode && mobile === identity.mobile;
};

const getBookingApprovalState = (booking) => ({
    userMarked: Boolean(booking?.userPaymentMarked),
    adminApproved: Boolean(booking?.adminPaymentApproved),
    adminRejected: Boolean(booking?.adminPaymentRejected),
    rejectionReason: String(booking?.paymentRejectionReason || ''),
    approvedAt: booking?.paymentApprovedAt || null,
    requestedAt: booking?.paymentRequestAt || null,
    updatedAt: booking?.paymentApprovalUpdatedAt || null
});

app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        if (!razorpayWebhookSecret) {
            return res.status(500).json({ message: 'RAZORPAY_WEBHOOK_SECRET is not configured' });
        }

        const signature = req.headers['x-razorpay-signature'];
        if (!signature) {
            return res.status(400).json({ message: 'Missing x-razorpay-signature header' });
        }

        const payloadBuffer = req.body;
        const expectedSignature = crypto
            .createHmac('sha256', razorpayWebhookSecret)
            .update(payloadBuffer)
            .digest('hex');

        if (expectedSignature !== signature) {
            return res.status(400).json({ message: 'Invalid webhook signature' });
        }

        const payload = JSON.parse(payloadBuffer.toString('utf8'));
        const event = String(payload.event || '');
        const paymentEntity = payload?.payload?.payment?.entity || {};
        const orderEntity = payload?.payload?.order?.entity || {};
        const orderId = paymentEntity.order_id || orderEntity.id || null;
        const paymentId = paymentEntity.id || null;
        const method = paymentEntity.method || null;

        if (!orderId) {
            return res.status(200).json({ received: true });
        }

        const statusByEvent = {
            'payment.authorized': 'authorized',
            'payment.captured': 'paid',
            'payment.failed': 'failed',
            'order.paid': 'paid'
        };
        const mappedStatus = statusByEvent[event] || null;

        const updatePayload = {
            lastEvent: event,
            paymentId: paymentId || undefined,
            method: method || undefined,
            webhookUpdatedAt: new Date()
        };
        if (mappedStatus) {
            updatePayload.status = mappedStatus;
            if (mappedStatus === 'paid') {
                updatePayload.paidAt = new Date();
            }
        }

        await Payment.findOneAndUpdate(
            { orderId },
            { $set: updatePayload, $push: { events: { event, receivedAt: new Date() } } },
            { new: true }
        );

        return res.status(200).json({ received: true });
    } catch (error) {
        return res.status(500).json({ message: 'Webhook handling failed', error: error.message });
    }
});

// app.use(cors({
//     origin: ['http://localhost:3000', 'http://localhost:3100', 'http://127.0.0.1:3000', 'http://127.0.0.1:3100'],
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
// }));
app.use(cors({
  origin: true,
  credentials: true
}));

app.options('*', cors());

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost:27017/qr-booking-system', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('Connected to MongoDB database');
})
.catch((err) => {
    console.error('Database connection error:', err);
    console.log('Starting server without database connection...');
});

const bookingSchema = new mongoose.Schema({
    bookingCode: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    bookingPurpose: { type: String, enum: ['meeting', 'camp', 'picnic', 'function', 'program', 'other'], default: 'other' },
    bookingPurposeOther: { type: String, default: '' },
    checkinDate: { type: Date, required: true },
    checkoutDate: { type: Date, required: true },
    paymentAmount: { type: Number, required: true },
    paymentType: { type: String, enum: ['advance', 'full', 'custom'], default: 'advance' },
    totalAmount: { type: Number, required: true },
    discountType: { type: String, enum: ['none', 'percentage', 'flat'], default: 'none' },
    discountValue: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },
    customAmount: { type: Number, default: 0 },
    whatsappNotification: { type: Boolean, default: true },
    profilePhoto: { type: String, default: null },
    userPaymentMarked: { type: Boolean, default: false },
    adminPaymentApproved: { type: Boolean, default: false },
    adminPaymentRejected: { type: Boolean, default: false },
    paymentRejectionReason: { type: String, default: '' },
    paymentApprovedAt: { type: Date, default: null },
    paymentRequestAt: { type: Date, default: null },
    paymentApprovalUpdatedAt: { type: Date, default: null },
    source: { type: String, enum: ['manual', 'excel-import'], default: 'manual' },
    status: { type: String, enum: ['confirmed', 'pending', 'canceled'], default: 'confirmed' }
}, { timestamps: true });

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

const bookingDeletionLogSchema = new mongoose.Schema({
    bookingId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, default: '' },
    mobile: { type: String, default: '' },
    checkinDate: { type: Date },
    checkoutDate: { type: Date },
    reason: { type: String, required: true },
    customReason: { type: String, default: '' },
    deletedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const BookingDeletionLog = mongoose.models.BookingDeletionLog || mongoose.model('BookingDeletionLog', bookingDeletionLogSchema);

const uiAssetSchema = new mongoose.Schema({
    _id: { type: String, default: 'global' },
    hallImageUrls: { type: [String], default: [] },
    adminLogoUrl: { type: String, default: '' }
}, { timestamps: true });

const UiAsset = mongoose.models.UiAsset || mongoose.model('UiAsset', uiAssetSchema);

const sanitizeUiImageList = (value) => {
    if (!Array.isArray(value)) return [];
    const cleaned = value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    return Array.from(new Set(cleaned)).slice(0, 12);
};

const normalizeUiAssetPayload = (doc = {}) => ({
    hallImageUrls: sanitizeUiImageList(doc.hallImageUrls || []),
    adminLogoUrl: typeof doc.adminLogoUrl === 'string' ? doc.adminLogoUrl : ''
});

const paymentSchema = new mongoose.Schema({
    bookingId: { type: String, required: true, index: true },
    userId: { type: String, default: '' },
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, default: '' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['created', 'authorized', 'paid', 'failed'], default: 'created', index: true },
    method: { type: String, default: '' },
    lastEvent: { type: String, default: 'order.created' },
    signatureVerified: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    webhookUpdatedAt: { type: Date, default: null },
    events: [{
        event: { type: String, required: true },
        receivedAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

const normalizeDate = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Invalid date format');
    }
    return parsed;
};

const sanitizeBookingPayload = (payload = {}) => {
    const name = String(payload.name || '').trim();
    const mobile = String(payload.mobile || '').replace(/\D/g, '');
    const bookingPurpose = String(payload.bookingPurpose || 'function').toLowerCase();
    const bookingPurposeOther = String(payload.bookingPurposeOther || '').trim();
    const checkinDate = payload.checkinDate;
    const checkoutDate = payload.checkoutDate;
    const paymentAmount = Number(payload.paymentAmount);
    const totalAmount = Number(payload.totalAmount);
    const discountType = payload.discountType || 'none';
    const discountValue = Number(payload.discountValue ?? 0);
    const customAmount = Number(payload.customAmount ?? paymentAmount ?? 0);
    const paymentType = payload.paymentType || 'advance';
    const whatsappNotification = payload.whatsappNotification !== false;
    const profilePhoto = payload.profilePhoto || null;

    if (!name) throw new Error('Name is required');
    if (mobile.length !== 10) throw new Error('Mobile must be exactly 10 digits');
    if (!['meeting', 'camp', 'picnic', 'function', 'program', 'other'].includes(bookingPurpose)) {
        throw new Error('Invalid booking purpose');
    }
    if (bookingPurpose === 'other' && payload.bookingPurpose && !bookingPurposeOther) {
        throw new Error('Please enter booking purpose details');
    }
    if (!checkinDate || !checkoutDate) throw new Error('Check-in and check-out date are required');
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new Error('Invalid payment amount');
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error('Invalid total amount');
    if (!['advance', 'full', 'custom'].includes(paymentType)) throw new Error('Invalid payment type');
    if (!['none', 'percentage', 'flat'].includes(discountType)) throw new Error('Invalid discount type');

    const checkin = normalizeDate(checkinDate);
    const checkout = normalizeDate(checkoutDate);
    if (checkout <= checkin) throw new Error('Checkout date must be after check-in date');

    let discountAmount = 0;
    if (discountType === 'percentage') {
        if (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > 100) {
            throw new Error('Discount percentage must be between 0 and 100');
        }
        discountAmount = (totalAmount * discountValue) / 100;
    } else if (discountType === 'flat') {
        if (!Number.isFinite(discountValue) || discountValue < 0) {
            throw new Error('Flat discount must be positive');
        }
        discountAmount = discountValue;
    }
    discountAmount = Math.min(discountAmount, totalAmount);
    const finalAmount = Math.max(totalAmount - discountAmount, 0);

    return {
        name,
        mobile,
        bookingPurpose,
        bookingPurposeOther: bookingPurpose === 'other' ? bookingPurposeOther : '',
        checkinDate: checkin,
        checkoutDate: checkout,
        paymentAmount,
        paymentType,
        totalAmount,
        discountType,
        discountValue: Number.isFinite(discountValue) ? discountValue : 0,
        discountAmount,
        finalAmount,
        customAmount: Number.isFinite(customAmount) ? customAmount : 0,
        whatsappNotification,
        profilePhoto
    };
};

const sanitizeAdminNoPaymentPayload = (payload = {}) => {
    const name = String(payload.name || '').trim();
    const mobile = String(payload.mobile || '').replace(/\D/g, '');
    const bookingPurpose = String(payload.bookingPurpose || '').toLowerCase();
    const bookingPurposeOther = String(payload.bookingPurposeOther || '').trim();
    const checkinDate = payload.checkinDate;
    const checkoutDate = payload.checkoutDate;

    if (!name) throw new Error('Name is required');
    if (mobile.length !== 10) throw new Error('Mobile must be exactly 10 digits');
    if (!['meeting', 'camp', 'picnic', 'function', 'program', 'other'].includes(bookingPurpose)) {
        throw new Error('Please select a booking purpose');
    }
    if (bookingPurpose === 'other' && !bookingPurposeOther) {
        throw new Error('Please enter booking purpose details');
    }
    if (!checkinDate || !checkoutDate) throw new Error('Check-in and check-out date are required');

    const checkin = normalizeDate(checkinDate);
    const checkout = normalizeDate(checkoutDate);
    if (checkout <= checkin) throw new Error('Checkout date must be after check-in date');

    return {
        name,
        mobile,
        bookingPurpose,
        bookingPurposeOther: bookingPurpose === 'other' ? bookingPurposeOther : '',
        checkinDate: checkin,
        checkoutDate: checkout,
        paymentAmount: 0,
        paymentType: 'custom',
        totalAmount: 0,
        discountType: 'none',
        discountValue: 0,
        discountAmount: 0,
        finalAmount: 0,
        customAmount: 0,
        whatsappNotification: false,
        profilePhoto: null,
        source: 'manual',
        status: 'confirmed'
    };
};

const generateUniqueBookingCode = async () => {
    for (let attempts = 0; attempts < 200; attempts++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const exists = await Booking.findOne({ bookingCode: code }).select('_id').lean();
        if (!exists) return code;
    }
    throw new Error('Unable to generate unique booking code');
};

const buildUpiQrPayload = async ({ amount, bookingId }) => {
    if (!upiId) {
        return {
            enabled: false,
            message: 'UPI_ID is not configured in environment'
        };
    }

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error('amount must be a positive number');
    }

    const note = `Booking ${bookingId}`;
    const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${amountValue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
    const qrCodeDataUrl = await QRCode.toDataURL(upiLink, { width: 320, margin: 1 });

    return {
        enabled: true,
        upiId,
        payeeName: upiPayeeName,
        note,
        upiLink,
        qrCodeDataUrl
    };
};

app.get('/', (req, res) => {
    res.json({
        message: 'Jharkhand Chhatriya Sangh Bhawan API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            bookings: '/api/bookings/*'
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        message: 'API is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version
    });
});

app.post('/api/auth/admin-login', (req, res) => {
    try {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }
        if (username !== adminUsername || password !== adminPassword) {
            return res.status(401).json({ message: 'Invalid admin credentials' });
        }
        const token = jwt.sign(
            { role: 'admin', username: adminUsername },
            adminJwtSecret,
            { expiresIn: adminTokenTtl }
        );
        return res.status(200).json({
            message: 'Admin login successful',
            token
        });
    } catch (error) {
        return res.status(500).json({ message: 'Admin login failed', error: error.message });
    }
});

app.get('/api/settings/ui-assets', async (req, res) => {
    try {
        const settingsDoc = await UiAsset.findById('global').lean();
        res.json({
            message: 'UI assets fetched successfully',
            settings: normalizeUiAssetPayload(settingsDoc || {})
        });
    } catch (error) {
        res.status(500).json({ message: 'Unable to fetch UI assets', error: error.message });
    }
});

app.patch('/api/settings/ui-assets', requireAdminAuth, async (req, res) => {
    try {
        const body = req.body || {};
        const hasHallImageUrls = Object.prototype.hasOwnProperty.call(body, 'hallImageUrls');
        const hasAdminLogoUrl = Object.prototype.hasOwnProperty.call(body, 'adminLogoUrl');

        if (!hasHallImageUrls && !hasAdminLogoUrl) {
            return res.status(400).json({ message: 'hallImageUrls or adminLogoUrl is required' });
        }
        if (hasHallImageUrls && !Array.isArray(body.hallImageUrls)) {
            return res.status(400).json({ message: 'hallImageUrls must be an array' });
        }
        if (hasAdminLogoUrl && body.adminLogoUrl !== null && typeof body.adminLogoUrl !== 'string') {
            return res.status(400).json({ message: 'adminLogoUrl must be a string' });
        }

        const updatePayload = {};
        if (hasHallImageUrls) {
            updatePayload.hallImageUrls = sanitizeUiImageList(body.hallImageUrls);
        }
        if (hasAdminLogoUrl) {
            updatePayload.adminLogoUrl = typeof body.adminLogoUrl === 'string' ? body.adminLogoUrl.trim() : '';
        }

        const updated = await UiAsset.findByIdAndUpdate(
            'global',
            { $set: updatePayload },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

        res.json({
            message: 'UI assets updated successfully',
            settings: normalizeUiAssetPayload(updated || {})
        });
    } catch (error) {
        res.status(500).json({ message: 'Unable to update UI assets', error: error.message });
    }
});

app.post('/api/payments/initiate', async (req, res) => {
    try {
        const { amount, bookingId, currency = 'INR', userId, paymentOption = 'all' } = req.body || {};
        const amountInPaise = Math.round(Number(amount) * 100);

        if (!amount || !bookingId) {
            return res.status(400).json({ message: 'amount and bookingId are required' });
        }
        if (!razorpayKeyId || !razorpayKeySecret) {
            return res.status(500).json({ message: 'Razorpay keys are not configured in environment' });
        }
        if (!razorpay) {
            razorpay = new Razorpay({
                key_id: razorpayKeyId,
                key_secret: razorpayKeySecret
            });
        }
        if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
            return res.status(400).json({ message: 'amount must be a positive number' });
        }

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency,
            receipt: `booking_${bookingId}`,
            notes: {
                bookingId: String(bookingId),
                userId: String(userId || '')
            }
        });

        await Payment.findOneAndUpdate(
            { orderId: order.id },
            {
                $set: {
                    bookingId: String(bookingId),
                    userId: String(userId || ''),
                    orderId: order.id,
                    amount: Number(order.amount),
                    currency: String(order.currency || 'INR'),
                    status: 'created',
                    lastEvent: 'order.created'
                },
                $push: { events: { event: 'order.created', receivedAt: new Date() } }
            },
            { upsert: true, new: true }
        );

        const selectedOption = String(paymentOption).toLowerCase();
        const includeUpiQr = selectedOption === 'upi_qr' || selectedOption === 'qr' || selectedOption === 'all';
        const upiQr = includeUpiQr ? await buildUpiQrPayload({ amount, bookingId }) : { enabled: false };
        const upiPluginConfig = {
            display: {
                blocks: {
                    upi: {
                        name: 'Pay with UPI QR Code',
                        instruments: [
                            { method: 'upi', flows: ['qr'] },
                            { method: 'upi', flows: ['intent'] },
                            { method: 'upi', flows: ['collect'] }
                        ]
                    }
                },
                sequence: ['block.upi'],
                preferences: {
                    show_default_blocks: false
                }
            }
        };

        res.status(200).json({
            message: 'Payment initiated successfully',
            keyId: razorpayKeyId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            status: order.status,
            statusEndpoint: `/api/payments/status/${order.id}`,
            paymentOptions: {
                checkout: {
                    enabled: true,
                    method: selectedOption === 'upi' ? 'upi' : 'all'
                },
                upi: {
                    enabled: true,
                    method: 'upi'
                },
                upiQr
            },
            checkoutConfig: selectedOption === 'upi' || selectedOption === 'upi_qr' || selectedOption === 'qr'
                ? upiPluginConfig
                : null
        });
    } catch (error) {
        res.status(500).json({
            message: 'Payment initiation failed',
            error: error.message
        });
    }
});

app.get('/api/payments/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({ message: 'orderId is required' });
        }

        const payment = await Payment.findOne({ orderId }).lean();
        if (!payment) {
            return res.status(404).json({ message: 'Payment record not found' });
        }

        return res.status(200).json({
            message: 'Payment status fetched successfully',
            orderId: payment.orderId,
            bookingId: payment.bookingId,
            status: payment.status,
            paymentId: payment.paymentId || null,
            method: payment.method || null,
            updatedAt: payment.updatedAt,
            paidAt: payment.paidAt || null
        });
    } catch (error) {
        return res.status(500).json({ message: 'Payment status fetch failed', error: error.message });
    }
});

app.post('/api/payments/upi-qr', async (req, res) => {
    try {
        const { amount, bookingId } = req.body || {};
        if (!amount || !bookingId) {
            return res.status(400).json({ message: 'amount and bookingId are required' });
        }

        const upiQr = await buildUpiQrPayload({ amount, bookingId });
        if (!upiQr.enabled) {
            return res.status(500).json(upiQr);
        }

        res.status(200).json({
            message: 'UPI QR generated successfully',
            ...upiQr
        });
    } catch (error) {
        res.status(500).json({
            message: 'UPI QR generation failed',
            error: error.message
        });
    }
});

app.post('/api/payments/verify', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required'
            });
        }
        if (!razorpayKeySecret) {
            return res.status(500).json({ message: 'Razorpay secret is not configured in environment' });
        }

        const generatedSignature = crypto
            .createHmac('sha256', razorpayKeySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        const verified = generatedSignature === razorpay_signature;
        if (!verified) {
            return res.status(400).json({ message: 'Payment signature verification failed', verified: false });
        }

        Payment.findOneAndUpdate(
            { orderId: razorpay_order_id },
            {
                $set: {
                    paymentId: razorpay_payment_id,
                    status: 'paid',
                    signatureVerified: true,
                    lastEvent: 'client.signature.verified',
                    method: 'upi',
                    paidAt: new Date()
                },
                $push: { events: { event: 'client.signature.verified', receivedAt: new Date() } }
            },
            { new: true }
        ).then((paymentDoc) => {
            res.status(200).json({
                message: 'Payment verified successfully',
                verified: true,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                status: paymentDoc?.status || 'paid'
            });
        }).catch((dbError) => {
            res.status(500).json({
                message: 'Payment verified but local status update failed',
                verified: true,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                error: dbError.message
            });
        });
        return;
    } catch (error) {
        res.status(500).json({
            message: 'Payment verification failed',
            error: error.message
        });
    }
});

app.get('/api/bookings/available-dates', async (req, res) => {
    try {
        const bookings = await Booking.find({ status: { $in: ['confirmed', 'pending'] } });
        const bookedDates = new Set();

        bookings.forEach((booking) => {
            const cursor = new Date(booking.checkinDate);
            const end = new Date(booking.checkoutDate);
            while (cursor < end) {
                bookedDates.add(cursor.toISOString().split('T')[0]);
                cursor.setDate(cursor.getDate() + 1);
            }
        });

        const availableDates = [];
        const today = new Date();
        for (let i = 1; i <= 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const key = date.toISOString().split('T')[0];
            if (!bookedDates.has(key)) {
                availableDates.push({ date: key, available: true });
            }
        }

        res.json({ message: 'Available dates retrieved successfully', availableDates });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching available dates', error: error.message });
    }
});

app.get('/api/bookings', async (req, res) => {
    try {
        const missingCodeBookings = await Booking.find({
            $or: [{ bookingCode: { $exists: false } }, { bookingCode: null }, { bookingCode: '' }]
        }).select('_id');

        for (const booking of missingCodeBookings) {
            const bookingCode = await generateUniqueBookingCode();
            await Booking.findByIdAndUpdate(booking._id, { bookingCode });
        }

        const bookings = await Booking.find().sort({ createdAt: -1 });
        res.json({ message: 'Bookings retrieved successfully', bookings });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching bookings', error: error.message });
    }
});

app.post('/api/bookings/public', async (req, res) => {
    try {
        const payload = sanitizeBookingPayload(req.body);
        const bookingCode = await generateUniqueBookingCode();
        const booking = await Booking.create({ ...payload, bookingCode, source: 'manual', status: 'confirmed' });
        res.status(201).json({ message: 'Booking saved successfully', booking });
    } catch (error) {
        res.status(400).json({ message: 'Error saving booking', error: error.message });
    }
});

app.post('/api/bookings', requireAdminAuth, async (req, res) => {
    try {
        const payload = sanitizeBookingPayload(req.body);
        const bookingCode = await generateUniqueBookingCode();
        const booking = await Booking.create({ ...payload, bookingCode, source: 'manual', status: 'confirmed' });
        res.status(201).json({ message: 'Booking created successfully', booking });
    } catch (error) {
        res.status(400).json({ message: 'Error creating booking', error: error.message });
    }
});

app.post('/api/bookings/admin-no-payment', requireAdminAuth, async (req, res) => {
    try {
        const payload = sanitizeAdminNoPaymentPayload(req.body);
        const bookingCode = await generateUniqueBookingCode();
        const booking = await Booking.create({ ...payload, bookingCode });
        res.status(201).json({ message: 'Admin no-payment booking created successfully', booking });
    } catch (error) {
        res.status(400).json({ message: 'Error creating admin no-payment booking', error: error.message });
    }
});

app.post('/api/bookings/pending-login', async (req, res) => {
    try {
        const bookingCode = String(req.body?.bookingCode || '').trim();
        const mobile = String(req.body?.mobile || '').replace(/\D/g, '');

        if (!/^\d{4}$/.test(bookingCode)) {
            return res.status(400).json({ message: 'Booking code must be 4 digits' });
        }
        if (mobile.length !== 10) {
            return res.status(400).json({ message: 'Mobile must be exactly 10 digits' });
        }

        const booking = await Booking.findOne({ bookingCode, mobile });
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found for provided code and mobile' });
        }

        const payableTotal = Number.isFinite(Number(booking.finalAmount)) ? Number(booking.finalAmount) : Number(booking.totalAmount);
        const paidAmount = Number.isFinite(Number(booking.paymentAmount)) ? Number(booking.paymentAmount) : 0;
        const pendingAmount = Math.max(payableTotal - paidAmount, 0);

        res.json({
            message: pendingAmount > 0 ? 'Pending payment booking found' : 'Booking is already fully paid',
            booking,
            pendingAmount,
            payableTotal
        });
    } catch (error) {
        res.status(400).json({ message: 'Error verifying pending payment login', error: error.message });
    }
});

app.post('/api/bookings/:id/payment-request', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        const identity = parseBookingIdentity(req.body || {});
        if (!bookingIdentityMatches(booking, identity)) {
            return res.status(403).json({ message: 'Booking verification failed' });
        }

        booking.userPaymentMarked = true;
        booking.adminPaymentApproved = false;
        booking.adminPaymentRejected = false;
        booking.paymentRejectionReason = '';
        booking.paymentApprovedAt = null;
        booking.paymentRequestAt = new Date();
        booking.paymentApprovalUpdatedAt = new Date();
        await booking.save();

        return res.status(200).json({
            message: 'Payment request submitted successfully',
            approval: getBookingApprovalState(booking)
        });
    } catch (error) {
        return res.status(400).json({ message: 'Error creating payment request', error: error.message });
    }
});

app.get('/api/bookings/:id/payment-approval', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        const isAdmin = Boolean(getAdminAuthPayload(req));
        if (!isAdmin) {
            const identity = parseBookingIdentity({
                bookingCode: req.query.bookingCode,
                mobile: req.query.mobile
            });
            if (!bookingIdentityMatches(booking, identity)) {
                return res.status(403).json({ message: 'Booking verification failed' });
            }
        }

        return res.status(200).json({
            message: 'Payment approval status fetched successfully',
            approval: getBookingApprovalState(booking)
        });
    } catch (error) {
        return res.status(400).json({ message: 'Error fetching payment approval status', error: error.message });
    }
});

app.patch('/api/bookings/:id/payment-approval', requireAdminAuth, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        const action = String(req.body?.action || '').toLowerCase();
        const rejectionReason = String(req.body?.rejectionReason || '').trim();
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ message: 'action must be approve or reject' });
        }

        booking.userPaymentMarked = true;
        booking.paymentApprovalUpdatedAt = new Date();
        if (action === 'approve') {
            booking.adminPaymentApproved = true;
            booking.adminPaymentRejected = false;
            booking.paymentRejectionReason = '';
            booking.paymentApprovedAt = new Date();
        } else {
            booking.adminPaymentApproved = false;
            booking.adminPaymentRejected = true;
            booking.paymentRejectionReason = rejectionReason || 'money not received';
            booking.paymentApprovedAt = null;
        }

        await booking.save();
        return res.status(200).json({
            message: action === 'approve' ? 'Payment approved successfully' : 'Payment rejected successfully',
            approval: getBookingApprovalState(booking)
        });
    } catch (error) {
        return res.status(400).json({ message: 'Error updating payment approval', error: error.message });
    }
});

app.post('/api/bookings/:id/pay-pending', async (req, res) => {
    try {
        const inputAmount = Number(req.body?.paymentAmount);
        if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
            return res.status(400).json({ message: 'Valid paymentAmount is required' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        const identity = parseBookingIdentity(req.body || {});
        if (!bookingIdentityMatches(booking, identity)) {
            return res.status(403).json({ message: 'Booking verification failed' });
        }

        const payableTotal = Number.isFinite(Number(booking.finalAmount)) ? Number(booking.finalAmount) : Number(booking.totalAmount);
        const currentPaid = Number.isFinite(Number(booking.paymentAmount)) ? Number(booking.paymentAmount) : 0;
        const pendingBefore = Math.max(payableTotal - currentPaid, 0);
        if (pendingBefore <= 0) {
            return res.status(400).json({ message: 'Booking is already fully paid' });
        }

        const acceptedAmount = Math.min(inputAmount, pendingBefore);
        const updatedPaid = currentPaid + acceptedAmount;
        const pendingAfter = Math.max(payableTotal - updatedPaid, 0);

        booking.paymentAmount = updatedPaid;
        booking.paymentType = pendingAfter === 0 ? 'full' : 'custom';
        booking.status = 'confirmed';
        booking.userPaymentMarked = true;
        booking.adminPaymentApproved = false;
        booking.adminPaymentRejected = false;
        booking.paymentRejectionReason = '';
        booking.paymentApprovedAt = null;
        booking.paymentRequestAt = new Date();
        booking.paymentApprovalUpdatedAt = new Date();
        await booking.save();

        res.json({
            message: pendingAfter === 0 ? 'Pending payment completed successfully' : 'Pending payment updated successfully',
            booking,
            paidNow: acceptedAmount,
            pendingAmount: pendingAfter
        });
    } catch (error) {
        res.status(400).json({ message: 'Error processing pending payment', error: error.message });
    }
});

app.put('/api/bookings/:id', requireAdminAuth, async (req, res) => {
    try {
        const payload = sanitizeBookingPayload(req.body);
        const updated = await Booking.findByIdAndUpdate(
            req.params.id,
            { ...payload, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        res.json({ message: 'Booking updated successfully', booking: updated });
    } catch (error) {
        res.status(400).json({ message: 'Error updating booking', error: error.message });
    }
});

app.delete('/api/bookings/:id', requireAdminAuth, async (req, res) => {
    try {
        const reason = (req.body?.reason || req.query?.reason || '').toString().trim();
        const customReason = (req.body?.customReason || '').toString().trim();
        if (!reason) {
            return res.status(400).json({ message: 'Delete reason is required' });
        }

        const deleted = await Booking.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        await BookingDeletionLog.create({
            bookingId: deleted._id,
            name: deleted.name,
            mobile: deleted.mobile,
            checkinDate: deleted.checkinDate,
            checkoutDate: deleted.checkoutDate,
            reason,
            customReason
        });

        res.json({ message: 'Booking deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting booking', error: error.message });
    }
});

// Fallback endpoint for clients/proxies that block DELETE method
app.post('/api/bookings/:id/delete', requireAdminAuth, async (req, res) => {
    try {
        const reason = (req.body?.reason || '').toString().trim();
        const customReason = (req.body?.customReason || '').toString().trim();
        if (!reason) {
            return res.status(400).json({ message: 'Delete reason is required' });
        }

        const deleted = await Booking.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        await BookingDeletionLog.create({
            bookingId: deleted._id,
            name: deleted.name,
            mobile: deleted.mobile,
            checkinDate: deleted.checkinDate,
            checkoutDate: deleted.checkoutDate,
            reason,
            customReason
        });

        res.json({ message: 'Booking deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting booking', error: error.message });
    }
});

app.get('/api/bookings/export', requireAdminAuth, async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ createdAt: -1 });
        const rows = bookings.map((booking) => ({
            id: booking._id.toString(),
            bookingCode: booking.bookingCode || '',
            name: booking.name,
            mobile: booking.mobile,
            bookingPurpose: booking.bookingPurpose || 'other',
            bookingPurposeOther: booking.bookingPurposeOther || '',
            checkinDate: new Date(booking.checkinDate).toISOString().split('T')[0],
            checkoutDate: new Date(booking.checkoutDate).toISOString().split('T')[0],
            paymentAmount: booking.paymentAmount,
            paymentType: booking.paymentType,
            totalAmount: booking.totalAmount,
            discountType: booking.discountType || 'none',
            discountValue: booking.discountValue || 0,
            discountAmount: booking.discountAmount || 0,
            finalAmount: booking.finalAmount ?? booking.totalAmount,
            customAmount: booking.customAmount,
            whatsappNotification: booking.whatsappNotification ? 'yes' : 'no',
            source: booking.source,
            status: booking.status,
            createdAt: booking.createdAt
        }));

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Bookings');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="bookings-${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: 'Error exporting bookings', error: error.message });
    }
});

app.post('/api/bookings/import', requireAdminAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: 'Excel file is required' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return res.status(400).json({ message: 'Excel file is empty' });
        }

        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        const payloads = [];
        for (const row of rows) {
            const bookingCode = await generateUniqueBookingCode();
            payloads.push({
                ...sanitizeBookingPayload(row),
                bookingCode,
                source: 'excel-import',
                status: 'confirmed'
            });
        }

        const inserted = await Booking.insertMany(payloads, { ordered: false });
        res.json({ message: 'Bookings imported successfully', importedCount: inserted.length });
    } catch (error) {
        res.status(400).json({ message: 'Error importing bookings', error: error.message });
    }
});

app.use('*', (req, res) => {
    res.status(404).json({
        message: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API documentation available at http://localhost:${PORT}/api/health`);
});

module.exports = app;
