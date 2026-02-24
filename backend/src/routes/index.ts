import { Router } from 'express';
import multer from 'multer';
import AuthController from '../controllers/authController';
import BookingController from '../controllers/bookingController';
import PaymentController from '../controllers/paymentController';
import QRController from '../controllers/qrController';
import SettingsController from '../controllers/settingsController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Health check route
router.get('/health', (req, res) => {
    res.status(200).json({ message: 'API is running', timestamp: new Date().toISOString() });
});

// Auth routes
router.post('/auth/register', AuthController.registerUser);
router.post('/auth/login', AuthController.loginUser);
router.get('/settings/admin-login', SettingsController.getAdminLoginSettings);

// Booking routes
router.get('/bookings/available-dates', BookingController.getAvailableDates);
router.get('/bookings', BookingController.getAllBookings);
router.post('/bookings/public', BookingController.createPublicBooking);
router.get('/bookings/export', BookingController.exportBookingsToExcel);
router.post('/bookings/import', upload.single('file'), BookingController.importBookingsFromExcel);
router.post('/bookings', authenticateToken, BookingController.createBooking);
router.get('/bookings/user/:userId', authenticateToken, BookingController.getUserBookings);
router.patch('/bookings/:bookingId/status', authenticateToken, BookingController.updateBookingStatus);

// Payment routes
router.post('/payments/initiate', authenticateToken, PaymentController.initiatePayment);
router.post('/payments/verify', PaymentController.verifyPayment);
router.post('/payments/methods', authenticateToken, PaymentController.createPaymentMethod);

// QR Code routes
router.get('/qr/booking/:bookingId/:userId', authenticateToken, QRController.generateBookingQR);
router.post('/qr/verify', QRController.verifyBookingQR);
router.get('/qr/download/:bookingId/:userId', authenticateToken, QRController.downloadBookingQR);

export default router;
