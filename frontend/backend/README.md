# Jharkhand Chhatriya Sangh Bhawan Backend

A Node.js/Express backend API for a QR code-based booking system with authentication, payment processing, and QR code generation.

## Features

- **User Authentication** (Register/Login with JWT)
- **Booking Management** (Create, view, update bookings)
- **Payment Processing** (Razorpay integration)
- **QR Code Generation** (Secure booking QR codes)
- **Database Integration** (MongoDB with Mongoose)

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud)
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your configuration:
   - Database URL
   - JWT Secret
   - Stripe API keys
   - Other required secrets

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## API Endpoints

### Health Check
- `GET /api/health` - Check API status

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/settings/admin-login` - Admin login modules/banner + booking timing settings

### Bookings
- `GET /api/bookings/available-dates` - Get available booking dates
- `GET /api/bookings` - Get all bookings (for admin table)
- `POST /api/bookings/public` - Save booking without auth (frontend kiosk flow)
- `GET /api/bookings/export` - Export bookings as Excel
- `POST /api/bookings/import` - Import bookings from Excel (`file` form-data)
- `POST /api/bookings` - Create new booking (requires auth)
- `GET /api/bookings/user/:userId` - Get user bookings (requires auth)
- `PATCH /api/bookings/:bookingId/status` - Update booking status (requires auth)

### Payments
- `POST /api/payments/initiate` - Initiate payment (requires auth)
- `POST /api/payments/verify` - Verify payment signature
- `POST /api/payments/methods` - Create payment method (requires auth)

### QR Codes
- `GET /api/qr/booking/:bookingId/:userId` - Generate booking QR code (requires auth)
- `POST /api/qr/verify` - Verify QR code
- `GET /api/qr/download/:bookingId/:userId` - Download QR code as PNG (requires auth)

## Authentication

Include JWT token in Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port (default: 3100) | No |
| DATABASE_URL | MongoDB connection string | Yes |
| JWT_SECRET | Secret for JWT signing | Yes |
| RAZORPAY_KEY_ID | Razorpay key id | Yes |
| RAZORPAY_KEY_SECRET | Razorpay key secret | Yes |
| QR_CODE_SECRET | Secret for QR code security | Yes |
| ADMIN_LOGIN_ENABLED | Toggle admin login settings for UI | No |
| ADMIN_LOGIN_MODULES | Comma-separated admin menu modules | No |
| BOOKING_CHECKIN_TIME | Fixed check-in time (HH:mm) | No |
| BOOKING_CHECKOUT_TIME | Fixed check-out time (HH:mm) | No |
| PERMANENT_BANNER_ENABLED | Enable permanent admin banner | No |
| PERMANENT_BANNER_BACKGROUND | Permanent banner background label/image key | No |

## Project Structure

```
src/
├── controllers/     # Request handlers
├── models/         # Database models
├── services/       # Business logic
├── routes/         # API routes
├── middleware/     # Custom middleware
├── utils/          # Utility functions
└── index.ts        # Main server file
```

## Database Models

### User
- username (string, unique)
- email (string, unique)
- password (hashed string)
- createdAt (date)

### Booking
- userId (ObjectId, ref: User)
- bookingDate (date)
- service (string)
- status (enum: confirmed/pending/canceled)
- createdAt (date)

## Development

### TypeScript
The project uses TypeScript for better type safety. Compile with:
```bash
npm run build
```

### Testing
```bash
npm test
```

## Security Features

- JWT authentication
- Password hashing with bcrypt
- CORS configuration
- QR code verification with hash validation
- Input validation and sanitization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License
