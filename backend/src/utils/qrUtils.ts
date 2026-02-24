import QRCode from 'qrcode';
import crypto from 'crypto';

export const generateQRCode = async (data: string): Promise<string> => {
    try {
        const qrCodeUrl = await QRCode.toDataURL(data, {
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
    } catch (error) {
        throw new Error('Failed to generate QR code: ' + error.message);
    }
};

export const generateBookingQRCode = async (bookingId: string, userId: string): Promise<string> => {
    try {
        // Create a secure booking verification URL
        const verificationData = {
            bookingId,
            userId,
            timestamp: Date.now(),
            // Add a hash for security
            hash: crypto.createHash('sha256').update(`${bookingId}-${userId}-${process.env.QR_CODE_SECRET || 'default_secret'}`).digest('hex')
        };
        
        const qrData = JSON.stringify(verificationData);
        return await generateQRCode(qrData);
    } catch (error) {
        throw new Error('Failed to generate booking QR code: ' + error.message);
    }
};

export const verifyBookingQRCode = (qrData: string): { bookingId: string; userId: string; isValid: boolean } => {
    try {
        const data = JSON.parse(qrData);
        const { bookingId, userId, timestamp, hash } = data;
        
        // Verify the hash
        const expectedHash = crypto.createHash('sha256').update(`${bookingId}-${userId}-${process.env.QR_CODE_SECRET || 'default_secret'}`).digest('hex');
        
        // Check if hash matches and QR code is not too old (24 hours)
        const isValid = hash === expectedHash && (Date.now() - timestamp) < (24 * 60 * 60 * 1000);
        
        return {
            bookingId,
            userId,
            isValid
        };
    } catch (error) {
        return {
            bookingId: '',
            userId: '',
            isValid: false
        };
    }
};

export const generateQRCodeBuffer = async (data: string): Promise<Buffer> => {
    try {
        const buffer = await QRCode.toBuffer(data, {
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
    } catch (error) {
        throw new Error('Failed to generate QR code buffer: ' + error.message);
    }
};