"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQRCodeBuffer = exports.verifyBookingQRCode = exports.generateBookingQRCode = exports.generateQRCode = void 0;
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
const generateQRCode = async (data) => {
    try {
        const qrCodeUrl = await qrcode_1.default.toDataURL(data, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return qrCodeUrl;
    }
    catch (error) {
        throw new Error('Failed to generate QR code: ' + error.message);
    }
};
exports.generateQRCode = generateQRCode;
const generateBookingQRCode = async (bookingId, userId) => {
    try {
        const verificationData = {
            bookingId,
            userId,
            timestamp: Date.now(),
            hash: crypto_1.default.createHash('sha256').update(`${bookingId}-${userId}-${process.env.QR_CODE_SECRET || 'default_secret'}`).digest('hex')
        };
        const qrData = JSON.stringify(verificationData);
        return await (0, exports.generateQRCode)(qrData);
    }
    catch (error) {
        throw new Error('Failed to generate booking QR code: ' + error.message);
    }
};
exports.generateBookingQRCode = generateBookingQRCode;
const verifyBookingQRCode = (qrData) => {
    try {
        const data = JSON.parse(qrData);
        const { bookingId, userId, timestamp, hash } = data;
        const expectedHash = crypto_1.default.createHash('sha256').update(`${bookingId}-${userId}-${process.env.QR_CODE_SECRET || 'default_secret'}`).digest('hex');
        const isValid = hash === expectedHash && (Date.now() - timestamp) < (24 * 60 * 60 * 1000);
        return {
            bookingId,
            userId,
            isValid
        };
    }
    catch (error) {
        return {
            bookingId: '',
            userId: '',
            isValid: false
        };
    }
};
exports.verifyBookingQRCode = verifyBookingQRCode;
const generateQRCodeBuffer = async (data) => {
    try {
        const buffer = await qrcode_1.default.toBuffer(data, {
            errorCorrectionLevel: 'M',
            type: 'png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return buffer;
    }
    catch (error) {
        throw new Error('Failed to generate QR code buffer: ' + error.message);
    }
};
exports.generateQRCodeBuffer = generateQRCodeBuffer;
//# sourceMappingURL=qrUtils.js.map