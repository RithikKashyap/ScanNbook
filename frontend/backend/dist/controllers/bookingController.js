"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bookingService_1 = __importDefault(require("../services/bookingService"));
class BookingController {
    constructor() {
        this.createBooking = async (req, res) => {
            try {
                const bookingData = req.body;
                if (!bookingData.userId || !bookingData.bookingDate || !bookingData.service) {
                    res.status(400).json({
                        message: 'User ID, booking date, and service are required'
                    });
                    return;
                }
                const booking = await this.bookingService.saveBooking(bookingData);
                res.status(201).json({
                    message: 'Booking created successfully',
                    booking
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Error creating booking',
                    error: error.message
                });
            }
        };
        this.createPublicBooking = async (req, res) => {
            try {
                const booking = await this.bookingService.createPublicBooking(req.body);
                res.status(201).json({
                    message: 'Booking saved successfully',
                    booking
                });
            }
            catch (error) {
                res.status(400).json({
                    message: 'Error saving booking',
                    error: error.message
                });
            }
        };
        this.getAllBookings = async (req, res) => {
            try {
                const bookings = await this.bookingService.getAllBookings();
                res.status(200).json({
                    message: 'Bookings retrieved successfully',
                    bookings
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Error fetching bookings',
                    error: error.message
                });
            }
        };
        this.exportBookingsToExcel = async (req, res) => {
            try {
                const buffer = await this.bookingService.getBookingsWorkbookBuffer();
                const fileName = `bookings-${new Date().toISOString().split('T')[0]}.xlsx`;
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.status(200).send(buffer);
            }
            catch (error) {
                res.status(500).json({
                    message: 'Error exporting bookings',
                    error: error.message
                });
            }
        };
        this.importBookingsFromExcel = async (req, res) => {
            try {
                const uploadedFile = req.file;
                if (!uploadedFile?.buffer) {
                    res.status(400).json({
                        message: 'Excel file is required'
                    });
                    return;
                }
                const result = await this.bookingService.importBookingsFromWorkbook(uploadedFile.buffer);
                res.status(200).json({
                    message: 'Bookings imported successfully',
                    ...result
                });
            }
            catch (error) {
                res.status(400).json({
                    message: 'Error importing bookings',
                    error: error.message
                });
            }
        };
        this.getAvailableDates = async (req, res) => {
            try {
                const availableDates = await this.bookingService.checkAvailability();
                res.status(200).json({
                    message: 'Available dates retrieved successfully',
                    availableDates
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Error fetching available dates',
                    error: error.message
                });
            }
        };
        this.getUserBookings = async (req, res) => {
            try {
                const { userId } = req.params;
                if (!userId) {
                    res.status(400).json({ message: 'User ID is required' });
                    return;
                }
                const bookings = await this.bookingService.getUserBookings(userId);
                res.status(200).json({
                    message: 'User bookings retrieved successfully',
                    bookings
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Error fetching user bookings',
                    error: error.message
                });
            }
        };
        this.updateBookingStatus = async (req, res) => {
            try {
                const { bookingId } = req.params;
                const { status } = req.body;
                if (!bookingId || !status) {
                    res.status(400).json({ message: 'Booking ID and status are required' });
                    return;
                }
                const booking = await this.bookingService.updateBookingStatus(bookingId, status);
                res.status(200).json({
                    message: 'Booking status updated successfully',
                    booking
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Error updating booking status',
                    error: error.message
                });
            }
        };
        this.bookingService = new bookingService_1.default();
    }
}
exports.default = new BookingController();
//# sourceMappingURL=bookingController.js.map