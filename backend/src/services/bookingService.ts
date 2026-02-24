import XLSX from 'xlsx';
import Booking, { IBooking } from '../models/booking';
import { getBookingTimingConfig } from '../config/uiConfig';

interface PublicBookingPayload {
    name: string;
    mobile: string;
    checkinDate: string;
    checkoutDate: string;
    paymentAmount: number;
    paymentType: 'advance' | 'full' | 'custom';
    totalAmount: number;
    customAmount: number;
    whatsappNotification: boolean;
    profilePhoto?: string | null;
}

class BookingService {
    private readonly bookingTimingConfig = getBookingTimingConfig();

    private normalizeDate(value: string | Date): Date {
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error('Invalid date format');
        }
        return parsed;
    }

    private parseTimeParts(time: string): { hours: number; minutes: number } {
        const [hoursStr, minutesStr] = time.split(':');
        const hours = Number(hoursStr);
        const minutes = Number(minutesStr);

        if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new Error(`Invalid booking time format: ${time}`);
        }

        return { hours, minutes };
    }

    private applyConfiguredTime(date: Date, type: 'checkin' | 'checkout'): Date {
        const time = type === 'checkin' ? this.bookingTimingConfig.checkInTime : this.bookingTimingConfig.checkOutTime;
        const { hours, minutes } = this.parseTimeParts(time);
        const value = new Date(date);
        value.setHours(hours, minutes, 0, 0);
        return value;
    }

    private sanitizeBookingInput(payload: Partial<PublicBookingPayload>): PublicBookingPayload {
        const name = (payload.name || '').trim();
        const mobile = (payload.mobile || '').replace(/\D/g, '');
        const checkinDate = payload.checkinDate || '';
        const checkoutDate = payload.checkoutDate || '';
        const paymentAmount = Number(payload.paymentAmount);
        const totalAmount = Number(payload.totalAmount);
        const customAmount = Number(payload.customAmount ?? paymentAmount ?? 0);
        const paymentType = (payload.paymentType || 'advance') as PublicBookingPayload['paymentType'];
        const whatsappNotification = Boolean(payload.whatsappNotification ?? true);
        const profilePhoto = payload.profilePhoto || null;

        if (!name) {
            throw new Error('Name is required');
        }
        if (mobile.length !== 10) {
            throw new Error('Mobile must be exactly 10 digits');
        }
        if (!checkinDate || !checkoutDate) {
            throw new Error('Check-in and check-out date are required');
        }
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            throw new Error('Payment amount must be a positive number');
        }
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            throw new Error('Total amount must be a positive number');
        }
        if (!['advance', 'full', 'custom'].includes(paymentType)) {
            throw new Error('Invalid payment type');
        }

        return {
            name,
            mobile,
            checkinDate,
            checkoutDate,
            paymentAmount,
            paymentType,
            totalAmount,
            customAmount: Number.isFinite(customAmount) ? customAmount : 0,
            whatsappNotification,
            profilePhoto
        };
    }

    async checkAvailability(): Promise<any[]> {
        try {
            // Get all dates that are already booked
            const bookedDates = await Booking.find({
                status: { $in: ['confirmed', 'pending'] }
            }).distinct('bookingDate');
            
            // Generate available dates for next 30 days
            const availableDates = [];
            const today = new Date();
            
            for (let i = 1; i <= 30; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                
                const isBooked = bookedDates.some(bookedDate => 
                    bookedDate.toDateString() === date.toDateString()
                );
                
                if (!isBooked) {
                    availableDates.push({
                        date: date.toISOString().split('T')[0],
                        available: true
                    });
                }
            }
            
            return availableDates;
        } catch (error: any) {
            throw new Error('Error checking availability: ' + error.message);
        }
    }

    async createPublicBooking(payload: Partial<PublicBookingPayload>): Promise<IBooking> {
        try {
            const cleanPayload = this.sanitizeBookingInput(payload);
            const checkinDate = this.applyConfiguredTime(this.normalizeDate(cleanPayload.checkinDate), 'checkin');
            const checkoutDate = this.applyConfiguredTime(this.normalizeDate(cleanPayload.checkoutDate), 'checkout');

            if (checkoutDate <= checkinDate) {
                throw new Error('Checkout date must be after check-in date');
            }

            const booking = new Booking({
                ...cleanPayload,
                checkinDate,
                checkoutDate,
                status: 'confirmed',
                source: 'manual',
                bookingDate: checkinDate,
                service: 'Hall Booking'
            });

            await booking.save();
            return booking;
        } catch (error: any) {
            throw new Error('Error creating booking: ' + error.message);
        }
    }

    async saveBooking(bookingData: any) {
        try {
            const { userId, bookingDate, service } = bookingData;
            
            // Check if the date is already booked
            const existingBooking = await Booking.findOne({
                bookingDate: new Date(bookingDate),
                status: { $in: ['confirmed', 'pending'] }
            });
            
            if (existingBooking) {
                throw new Error('This date is already booked');
            }
            
            const booking = new Booking({
                userId,
                bookingDate: new Date(bookingDate),
                service,
                status: 'pending'
            });
            
            await booking.save();
            return booking;
        } catch (error: any) {
            throw new Error('Error creating booking: ' + error.message);
        }
    }

    async getAllBookings() {
        try {
            return await Booking.find().sort({ createdAt: -1 });
        } catch (error: any) {
            throw new Error('Error fetching bookings: ' + error.message);
        }
    }

    async getBookingsWorkbookBuffer() {
        try {
            const bookings = await this.getAllBookings();
            const rows = bookings.map((booking) => ({
                id: booking._id.toString(),
                name: booking.name,
                mobile: booking.mobile,
                checkinDate: booking.checkinDate ? new Date(booking.checkinDate).toISOString().split('T')[0] : '',
                checkinTime: booking.checkinDate
                    ? new Date(booking.checkinDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
                    : '',
                checkoutDate: booking.checkoutDate ? new Date(booking.checkoutDate).toISOString().split('T')[0] : '',
                checkoutTime: booking.checkoutDate
                    ? new Date(booking.checkoutDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
                    : '',
                paymentAmount: booking.paymentAmount,
                paymentType: booking.paymentType,
                totalAmount: booking.totalAmount,
                customAmount: booking.customAmount,
                whatsappNotification: booking.whatsappNotification ? 'yes' : 'no',
                source: booking.source,
                status: booking.status,
                createdAt: booking.createdAt ? new Date(booking.createdAt).toISOString() : ''
            }));

            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Bookings');
            return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        } catch (error: any) {
            throw new Error('Error preparing export file: ' + error.message);
        }
    }

    async importBookingsFromWorkbook(fileBuffer: Buffer) {
        try {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
                throw new Error('Excel file is empty');
            }

            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
            if (!rows.length) {
                throw new Error('No rows found in excel file');
            }

            const payloads = rows.map((row) => {
                const booking = this.sanitizeBookingInput({
                    name: row.name,
                    mobile: row.mobile,
                    checkinDate: row.checkinDate,
                    checkoutDate: row.checkoutDate,
                    paymentAmount: row.paymentAmount,
                    paymentType: row.paymentType,
                    totalAmount: row.totalAmount,
                    customAmount: row.customAmount,
                    whatsappNotification: row.whatsappNotification === 'yes' || row.whatsappNotification === true
                });

                const checkinDate = this.applyConfiguredTime(this.normalizeDate(booking.checkinDate), 'checkin');
                const checkoutDate = this.applyConfiguredTime(this.normalizeDate(booking.checkoutDate), 'checkout');
                if (checkoutDate <= checkinDate) {
                    throw new Error(`Invalid date range for ${booking.name}`);
                }

                return {
                    ...booking,
                    checkinDate,
                    checkoutDate,
                    status: 'confirmed' as const,
                    source: 'excel-import' as const,
                    bookingDate: checkinDate,
                    service: 'Hall Booking'
                };
            });

            const created = await Booking.insertMany(payloads, { ordered: false });
            return { importedCount: created.length };
        } catch (error: any) {
            throw new Error('Error importing bookings: ' + error.message);
        }
    }

    async getUserBookings(userId: string) {
        try {
            return await Booking.find({ userId: userId as any }).sort({ createdAt: -1 });
        } catch (error: any) {
            throw new Error('Error fetching user bookings: ' + error.message);
        }
    }

    async updateBookingStatus(bookingId: string, status: string) {
        try {
            const safeStatus = status as IBooking['status'];
            const booking = await Booking.findByIdAndUpdate(
                bookingId,
                { status: safeStatus },
                { new: true }
            );
            
            if (!booking) {
                throw new Error('Booking not found');
            }
            
            return booking;
        } catch (error: any) {
            throw new Error('Error updating booking status: ' + error.message);
        }
    }
}

export default BookingService;
