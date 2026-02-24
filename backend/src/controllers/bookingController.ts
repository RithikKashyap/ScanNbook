import { Request, Response } from 'express';
import BookingService from '../services/bookingService';

class BookingController {
    private bookingService: BookingService;

    constructor() {
        this.bookingService = new BookingService();
    }

    public createBooking = async (req: Request, res: Response): Promise<void> => {
        try {
            const bookingData = req.body;
            
            // Validate required fields
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
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Error creating booking', 
                error: error.message 
            });
        }
    };

    public createPublicBooking = async (req: Request, res: Response): Promise<void> => {
        try {
            const booking = await this.bookingService.createPublicBooking(req.body);
            res.status(201).json({
                message: 'Booking saved successfully',
                booking
            });
        } catch (error: any) {
            res.status(400).json({
                message: 'Error saving booking',
                error: error.message
            });
        }
    };

    public getAllBookings = async (req: Request, res: Response): Promise<void> => {
        try {
            const bookings = await this.bookingService.getAllBookings();
            res.status(200).json({
                message: 'Bookings retrieved successfully',
                bookings
            });
        } catch (error: any) {
            res.status(500).json({
                message: 'Error fetching bookings',
                error: error.message
            });
        }
    };

    public exportBookingsToExcel = async (req: Request, res: Response): Promise<void> => {
        try {
            const buffer = await this.bookingService.getBookingsWorkbookBuffer();
            const fileName = `bookings-${new Date().toISOString().split('T')[0]}.xlsx`;

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.status(200).send(buffer);
        } catch (error: any) {
            res.status(500).json({
                message: 'Error exporting bookings',
                error: error.message
            });
        }
    };

    public importBookingsFromExcel = async (req: Request, res: Response): Promise<void> => {
        try {
            const uploadedFile = (req as Request & { file?: Express.Multer.File }).file;
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
        } catch (error: any) {
            res.status(400).json({
                message: 'Error importing bookings',
                error: error.message
            });
        }
    };

    public getAvailableDates = async (req: Request, res: Response): Promise<void> => {
        try {
            const availableDates = await this.bookingService.checkAvailability();
            res.status(200).json({
                message: 'Available dates retrieved successfully',
                availableDates
            });
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Error fetching available dates', 
                error: error.message 
            });
        }
    };

    public getUserBookings = async (req: Request, res: Response): Promise<void> => {
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
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Error fetching user bookings', 
                error: error.message 
            });
        }
    };

    public updateBookingStatus = async (req: Request, res: Response): Promise<void> => {
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
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Error updating booking status', 
                error: error.message 
            });
        }
    };
}

export default new BookingController();
