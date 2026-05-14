import { Request, Response } from 'express';
import { generateBookingQRCode, verifyBookingQRCode, generateQRCodeBuffer } from '../utils/qrUtils';
import BookingService from '../services/bookingService';

class QRController {
    private bookingService: BookingService;

    constructor() {
        this.bookingService = new BookingService();
    }

    public generateBookingQR = async (req: Request, res: Response): Promise<void> => {
        try {
            const { bookingId, userId } = req.params;
            
            if (!bookingId || !userId) {
                res.status(400).json({ message: 'Booking ID and User ID are required' });
                return;
            }

            const qrCodeUrl = await generateBookingQRCode(bookingId, userId);
            res.status(200).json({
                message: 'QR code generated successfully',
                qrCode: qrCodeUrl
            });
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Failed to generate QR code', 
                error: error.message 
            });
        }
    };

    public verifyBookingQR = async (req: Request, res: Response): Promise<void> => {
        try {
            const { qrData } = req.body;
            
            if (!qrData) {
                res.status(400).json({ message: 'QR data is required' });
                return;
            }

            const verification = verifyBookingQRCode(qrData);
            
            if (!verification.isValid) {
                res.status(400).json({ 
                    message: 'Invalid or expired QR code',
                    isValid: false 
                });
                return;
            }

            // Optionally fetch booking details
            const bookings = await this.bookingService.getUserBookings(verification.userId);
            const booking = bookings.find(b => b._id.toString() === verification.bookingId);

            res.status(200).json({
                message: 'QR code verified successfully',
                isValid: true,
                bookingId: verification.bookingId,
                userId: verification.userId,
                booking: booking || null
            });
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Failed to verify QR code', 
                error: error.message 
            });
        }
    };

    public downloadBookingQR = async (req: Request, res: Response): Promise<void> => {
        try {
            const { bookingId, userId } = req.params;
            
            if (!bookingId || !userId) {
                res.status(400).json({ message: 'Booking ID and User ID are required' });
                return;
            }

            // Generate QR code data
            const verificationData = {
                bookingId,
                userId,
                timestamp: Date.now()
            };
            
            const qrBuffer = await generateQRCodeBuffer(JSON.stringify(verificationData));
            
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition', `attachment; filename="booking-${bookingId}-qr.png"`);
            res.send(qrBuffer);
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Failed to download QR code', 
                error: error.message 
            });
        }
    };
}

export default new QRController();