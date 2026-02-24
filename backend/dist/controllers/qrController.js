"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const qrUtils_1 = require("../utils/qrUtils");
const bookingService_1 = __importDefault(require("../services/bookingService"));
class QRController {
    constructor() {
        this.generateBookingQR = async (req, res) => {
            try {
                const { bookingId, userId } = req.params;
                if (!bookingId || !userId) {
                    res.status(400).json({ message: 'Booking ID and User ID are required' });
                    return;
                }
                const qrCodeUrl = await (0, qrUtils_1.generateBookingQRCode)(bookingId, userId);
                res.status(200).json({
                    message: 'QR code generated successfully',
                    qrCode: qrCodeUrl
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Failed to generate QR code',
                    error: error.message
                });
            }
        };
        this.verifyBookingQR = async (req, res) => {
            try {
                const { qrData } = req.body;
                if (!qrData) {
                    res.status(400).json({ message: 'QR data is required' });
                    return;
                }
                const verification = (0, qrUtils_1.verifyBookingQRCode)(qrData);
                if (!verification.isValid) {
                    res.status(400).json({
                        message: 'Invalid or expired QR code',
                        isValid: false
                    });
                    return;
                }
                const bookings = await this.bookingService.getUserBookings(verification.userId);
                const booking = bookings.find(b => b._id.toString() === verification.bookingId);
                res.status(200).json({
                    message: 'QR code verified successfully',
                    isValid: true,
                    bookingId: verification.bookingId,
                    userId: verification.userId,
                    booking: booking || null
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Failed to verify QR code',
                    error: error.message
                });
            }
        };
        this.downloadBookingQR = async (req, res) => {
            try {
                const { bookingId, userId } = req.params;
                if (!bookingId || !userId) {
                    res.status(400).json({ message: 'Booking ID and User ID are required' });
                    return;
                }
                const verificationData = {
                    bookingId,
                    userId,
                    timestamp: Date.now()
                };
                const qrBuffer = await (0, qrUtils_1.generateQRCodeBuffer)(JSON.stringify(verificationData));
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Content-Disposition', `attachment; filename="booking-${bookingId}-qr.png"`);
                res.send(qrBuffer);
            }
            catch (error) {
                res.status(500).json({
                    message: 'Failed to download QR code',
                    error: error.message
                });
            }
        };
        this.bookingService = new bookingService_1.default();
    }
}
exports.default = new QRController();
//# sourceMappingURL=qrController.js.map