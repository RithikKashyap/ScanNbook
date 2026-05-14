import React, { useState } from 'react';

type Page = 'login' | 'booking' | 'summary' | 'payment' | 'approval-waiting' | 'confirmation' | 'booking-details-login' | 'pending-login' | 'pending-payment' | 'admin-login' | 'admin-panel';
const configuredApiBase = (process.env.REACT_APP_API_BASE_URL || '').trim();
const REMOTE_API_BASE = 'https://scannbook.onrender.com/api';
const LOCAL_API_BASES = ['http://localhost:5000/api', 'http://localhost:3100/api'];
const isBrowser = typeof window !== 'undefined';
const isRuntimeLocalHost = isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const isConfiguredLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(configuredApiBase);
const API_BASES = (() => {
  if (configuredApiBase && !(isConfiguredLocalApi && !isRuntimeLocalHost)) {
    return [configuredApiBase];
  }
  if (isRuntimeLocalHost) {
    return [REMOTE_API_BASE, ...LOCAL_API_BASES];
  }
  return [REMOTE_API_BASE];
})();
const HALL_IMAGE_STORAGE_KEY = 'hallRoomImageUrl';
const HALL_IMAGE_LIST_STORAGE_KEY = 'hallRoomImageUrls';
const ADMIN_LOGO_STORAGE_KEY = 'adminPanelLogoUrl';
const ADMIN_TOKEN_STORAGE_KEY = 'adminAuthToken';
const CONTACT_REVEAL_DELAY_SECONDS = 60;
const ADMIN_CONTACT_RAW = (process.env.REACT_APP_ADMIN_WHATSAPP || '8709276546').trim();
const ADMIN_CONTACT_DIGITS = ADMIN_CONTACT_RAW.replace(/\D/g, '');
const ADMIN_CONTACT_PHONE = ADMIN_CONTACT_DIGITS.length > 10 ? ADMIN_CONTACT_DIGITS.slice(-10) : ADMIN_CONTACT_DIGITS;
const ADMIN_CONTACT_DISPLAY = ADMIN_CONTACT_PHONE || '8709276546';

type PaymentApprovalState = {
  userMarked: boolean;
  adminApproved: boolean;
  adminRejected?: boolean;
  rejectionReason?: string;
  approvedAt?: string;
};

type PaymentApprovalMap = Record<string, PaymentApprovalState>;

const normalizeHallImageUrls = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, 12);
};

const readHallImagesFromLocalStorage = (): string[] => {
  try {
    const listRaw = window.localStorage.getItem(HALL_IMAGE_LIST_STORAGE_KEY);
    if (listRaw) {
      const parsed = JSON.parse(listRaw);
      return normalizeHallImageUrls(parsed);
    }
    const singleStored = window.localStorage.getItem(HALL_IMAGE_STORAGE_KEY);
    if (!singleStored || !singleStored.trim()) return [];
    return normalizeHallImageUrls([singleStored]);
  } catch {
    return [];
  }
};

const saveHallImagesToLocalStorage = (imageUrls: string[]) => {
  try {
    const next = normalizeHallImageUrls(imageUrls);
    window.localStorage.setItem(HALL_IMAGE_LIST_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(HALL_IMAGE_STORAGE_KEY, next[0] || '');
  } catch {
    // ignore storage errors
  }
};

const saveAdminLogoToLocalStorage = (logoUrl: string) => {
  try {
    if (logoUrl) {
      window.localStorage.setItem(ADMIN_LOGO_STORAGE_KEY, logoUrl);
    } else {
      window.localStorage.removeItem(ADMIN_LOGO_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
};

const parseJsonSafe = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const apiFetch = async (path: string, options?: RequestInit) => {
  let networkError: any = null;

  for (const baseUrl of API_BASES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      return response;
    } catch (error: any) {
      networkError = error;
    }
  }

  throw new Error(networkError?.message || 'Unable to connect to API server');
};

const withAdminAuth = (adminToken: string, headers: Record<string, string> = {}) => {
  if (!adminToken.trim()) return headers;
  return {
    ...headers,
    Authorization: `Bearer ${adminToken.trim()}`
  };
};

const toPaymentApprovalState = (raw: any): PaymentApprovalState => ({
  userMarked: Boolean(raw?.userMarked ?? raw?.userPaymentMarked),
  adminApproved: Boolean(raw?.adminApproved ?? raw?.adminPaymentApproved),
  adminRejected: Boolean(raw?.adminRejected ?? raw?.adminPaymentRejected),
  rejectionReason: raw?.rejectionReason ?? raw?.paymentRejectionReason ?? '',
  approvedAt: raw?.approvedAt ?? raw?.paymentApprovedAt ?? undefined
});

const createApprovalMapFromBookings = (bookings: BookingRecord[]): PaymentApprovalMap => {
  return bookings.reduce<PaymentApprovalMap>((acc, booking) => {
    acc[booking._id] = toPaymentApprovalState(booking);
    return acc;
  }, {});
};

const requestPaymentApprovalFromServer = async (bookingId: string, bookingCode: string, mobile: string) => {
  if (!bookingId) return null;
  const response = await apiFetch(`/bookings/${bookingId}/payment-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingCode, mobile })
  });
  const result = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(result?.error || result?.message || 'Unable to submit payment request');
  }
  return toPaymentApprovalState(result?.approval || result?.booking || {});
};

const fetchPaymentApprovalStatusFromServer = async (bookingId: string, bookingCode: string, mobile: string) => {
  if (!bookingId) return null;
  const query = new URLSearchParams({
    bookingCode,
    mobile
  }).toString();
  const response = await apiFetch(`/bookings/${bookingId}/payment-approval?${query}`);
  const result = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(result?.error || result?.message || 'Unable to refresh payment status');
  }
  return toPaymentApprovalState(result?.approval || result?.booking || {});
};

const submitPaymentApprovalDecision = async (
  bookingId: string,
  action: 'approve' | 'reject',
  adminToken: string,
  rejectionReason = ''
) => {
  const response = await apiFetch(`/bookings/${bookingId}/payment-approval`, {
    method: 'PATCH',
    headers: withAdminAuth(adminToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action, rejectionReason })
  });
  const result = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(result?.error || result?.message || 'Unable to update payment approval');
  }
  return toPaymentApprovalState(result?.approval || result?.booking || {});
};

const rejectPaymentRequestByUser = async (
  bookingId: string,
  bookingCode: string,
  mobile: string,
  rejectionReason = 'Rejected by user from back to payment'
) => {
  const requestCandidates = [
    {
      path: `/bookings/${bookingId}/payment-approval`,
      method: 'PATCH' as const,
      body: { bookingCode, mobile, action: 'reject', rejectionReason, source: 'user-back-to-payment' }
    },
    {
      path: `/bookings/${bookingId}/payment-request/reject`,
      method: 'POST' as const,
      body: { bookingCode, mobile, action: 'reject', rejectionReason }
    },
    {
      path: `/bookings/${bookingId}/payment-request/cancel`,
      method: 'POST' as const,
      body: { bookingCode, mobile, action: 'reject', rejectionReason }
    },
    {
      path: `/bookings/${bookingId}/payment-request`,
      method: 'PATCH' as const,
      body: { bookingCode, mobile, action: 'reject', rejectionReason }
    }
  ];

  for (const candidate of requestCandidates) {
    const response = await apiFetch(candidate.path, {
      method: candidate.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate.body)
    });
    const result = await parseJsonSafe(response);

    if (response.ok) {
      return toPaymentApprovalState(result?.approval || result?.booking || {
        userMarked: false,
        adminApproved: false,
        adminRejected: true,
        rejectionReason
      });
    }

    if (response.status === 404 || response.status === 405 || response.status === 401 || response.status === 403) {
      continue;
    }

    throw new Error(result?.error || result?.message || 'Unable to reject payment request');
  }

  throw new Error('Unable to sync rejection with server. Please try again.');
};

interface BookingData {
  bookingCode?: string;
  name: string;
  purpose: string;
  gender: '' | 'male' | 'female' | 'other';
  email: string;
  mobile: string;
  checkinDate: string;
  checkoutDate: string;
  paymentAmount: number;
  paymentType: 'advance' | 'full' | 'custom';
  totalAmount: number;
  customAmount: number;
  includeSecurityDeposit: boolean;
  whatsappNotification: boolean;
  profilePhoto: string | null;
}

interface BookingRecord {
  _id: string;
  bookingCode?: string;
  name: string;
  mobile: string;
  bookingPurpose?: 'meeting' | 'camp' | 'picnic' | 'function' | 'program' | 'other';
  bookingPurposeOther?: string;
  checkinDate: string;
  checkoutDate: string;
  paymentAmount: number;
  paymentType: 'advance' | 'full' | 'custom';
  totalAmount: number;
  discountType?: 'none' | 'percentage' | 'flat';
  discountValue?: number;
  discountAmount?: number;
  finalAmount?: number;
  includeSecurityDeposit?: boolean;
  securityDepositAmount?: number;
  status: string;
  source: string;
  createdAt: string;
  userPaymentMarked?: boolean;
  adminPaymentApproved?: boolean;
  adminPaymentRejected?: boolean;
  paymentRejectionReason?: string;
  paymentApprovedAt?: string;
  profilePhoto?: string | null;
}

interface PendingPaymentSession {
  bookingId: string;
  bookingCode: string;
  name: string;
  mobile: string;
  payableTotal: number;
  pendingAmount: number;
}

type CustomerNotificationTemplate =
  | 'pending-payment-approved'
  | 'pending-payment-reminder'
  | 'partial-payment-received'
  | 'payment-rejected'
  | 'booking-confirmation'
  | 'booking-approved'
  | 'booking-cancelled'
  | 'event-reminder'
  | 'payment-receipt';

const USER_FLOW_STORAGE_KEY = 'publicUserFlowState';
const ALL_PAGES: Page[] = ['login', 'booking', 'summary', 'payment', 'approval-waiting', 'confirmation', 'booking-details-login', 'pending-login', 'pending-payment', 'admin-login', 'admin-panel'];

const isValidPage = (value: unknown): value is Page => {
  return typeof value === 'string' && ALL_PAGES.includes(value as Page);
};

const defaultBookingData: BookingData = {
  bookingCode: '',
  name: '',
  purpose: 'stay',
  gender: '',
  email: '',
  mobile: '',
  checkinDate: '',
  checkoutDate: '',
  paymentAmount: 3500,
  paymentType: 'full',
  totalAmount: 3500,
  customAmount: 1000,
  includeSecurityDeposit: true,
  whatsappNotification: true,
  profilePhoto: null
};

type PersistedUserFlow = {
  currentPage?: Page;
  saveError?: string;
  pendingPaymentSession?: PendingPaymentSession | null;
  approvalWaitingBooking?: { id: string; code: string; mobile: string } | null;
  approvalWaitingStatus?: PaymentApprovalState | null;
  approvalWaitingContext?: 'booking' | 'pending-payment';
  bookingData?: BookingData;
};

const readPersistedUserFlow = (): PersistedUserFlow => {
  try {
    const raw = window.sessionStorage.getItem(USER_FLOW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const persisted = readPersistedUserFlow();
    return isValidPage(persisted.currentPage) ? persisted.currentPage : 'login';
  });
  const [saveError, setSaveError] = useState<string>(() => {
    const persisted = readPersistedUserFlow();
    return typeof persisted.saveError === 'string' ? persisted.saveError : '';
  });
  const [pendingPaymentSession, setPendingPaymentSession] = useState<PendingPaymentSession | null>(() => {
    const persisted = readPersistedUserFlow();
    return persisted.pendingPaymentSession || null;
  });
  const [approvalWaitingBooking, setApprovalWaitingBooking] = useState<{ id: string; code: string; mobile: string } | null>(() => {
    const persisted = readPersistedUserFlow();
    return persisted.approvalWaitingBooking || null;
  });
  const [approvalWaitingStatus, setApprovalWaitingStatus] = useState<PaymentApprovalState | null>(() => {
    const persisted = readPersistedUserFlow();
    return persisted.approvalWaitingStatus || null;
  });
  const [approvalWaitingContext, setApprovalWaitingContext] = useState<'booking' | 'pending-payment'>(() => {
    const persisted = readPersistedUserFlow();
    return persisted.approvalWaitingContext === 'pending-payment' ? 'pending-payment' : 'booking';
  });
  const [adminToken, setAdminToken] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    try {
      return Boolean(window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [hallImageUrls, setHallImageUrls] = useState<string[]>(() => readHallImagesFromLocalStorage());
  const [bookingData, setBookingData] = useState<BookingData>(() => {
    const persisted = readPersistedUserFlow();
    return {
      ...defaultBookingData,
      ...(persisted.bookingData || {})
    };
  });

  React.useEffect(() => {
    let isMounted = true;
    const loadUiAssets = async () => {
      try {
        const response = await apiFetch('/settings/ui-assets');
        const result = await parseJsonSafe(response);
        if (!response.ok) return;
        const nextHallImages = normalizeHallImageUrls(result?.settings?.hallImageUrls);
        if (!isMounted) return;
        setHallImageUrls(nextHallImages);
        saveHallImagesToLocalStorage(nextHallImages);
      } catch {
        // keep local fallback
      }
    };
    void loadUiAssets();
    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    try {
      const payload: PersistedUserFlow = {
        currentPage,
        saveError,
        pendingPaymentSession,
        approvalWaitingBooking,
        approvalWaitingStatus,
        approvalWaitingContext,
        bookingData
      };
      window.sessionStorage.setItem(USER_FLOW_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [currentPage, saveError, pendingPaymentSession, approvalWaitingBooking, approvalWaitingStatus, approvalWaitingContext, bookingData]);

  const saveBookingToMongo = async () => {
    setSaveError('');
    try {
      const response = await apiFetch('/bookings/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bookingData)
      });

      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Unable to save booking');
      }
      if (result?.booking?.bookingCode) {
        setBookingData((prev) => ({ ...prev, bookingCode: result.booking.bookingCode }));
      }
      if (result?.booking?._id) {
        const bookingId = String(result.booking._id);
        let latestStatus: PaymentApprovalState | null = null;
        try {
          latestStatus = await requestPaymentApprovalFromServer(
            bookingId,
            String(result?.booking?.bookingCode || bookingData.bookingCode || ''),
            String(result?.booking?.mobile || bookingData.mobile || '')
          );
        } catch (approvalError: any) {
          setSaveError(approvalError?.message || 'Booking saved but payment request was not recorded');
        }
        setApprovalWaitingBooking({
          id: bookingId,
          code: String(result?.booking?.bookingCode || bookingData.bookingCode || ''),
          mobile: String(result?.booking?.mobile || bookingData.mobile || '')
        });
        setApprovalWaitingStatus(latestStatus);
        setApprovalWaitingContext('booking');
        setCurrentPage('approval-waiting');
        return;
      }
      setCurrentPage('confirmation');
    } catch (error: any) {
      setSaveError(error?.message || 'Unable to save booking');
      setCurrentPage('confirmation');
    }
  };

  const refreshApprovalStatus = React.useCallback(async () => {
    if (!approvalWaitingBooking?.id) return;
    try {
      const status = await fetchPaymentApprovalStatusFromServer(
        approvalWaitingBooking.id,
        approvalWaitingBooking.code,
        approvalWaitingBooking.mobile
      );
      setApprovalWaitingStatus(status);
      if (status?.adminApproved) {
        if (approvalWaitingContext === 'pending-payment') {
          setPendingPaymentSession(null);
          setApprovalWaitingBooking(null);
          setApprovalWaitingStatus(null);
          setCurrentPage('pending-login');
          alert('Pending payment approved by admin');
        } else {
          setCurrentPage('confirmation');
        }
      }
    } catch (error: any) {
      setSaveError((prev) => prev || (error?.message || 'Unable to refresh payment status'));
    }
  }, [approvalWaitingBooking?.code, approvalWaitingBooking?.id, approvalWaitingBooking?.mobile, approvalWaitingContext]);

  React.useEffect(() => {
    if (currentPage !== 'approval-waiting' || !approvalWaitingBooking?.id) return;
    void refreshApprovalStatus();
    const timer = window.setInterval(() => {
      void refreshApprovalStatus();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [currentPage, approvalWaitingBooking?.id, refreshApprovalStatus]);

  const handlePendingPaymentLogin = async (bookingCode: string, mobile: string) => {
    const response = await apiFetch('/bookings/pending-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bookingCode, mobile })
    });

    const result = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(result?.error || result?.message || 'Unable to verify booking credentials');
    }

    const booking = result?.booking;
    if (!booking?._id) {
      throw new Error('Booking details missing from server response');
    }

    const pendingAmount = Number(result?.pendingAmount ?? 0);
    const payableTotal = Number(result?.payableTotal ?? booking?.finalAmount ?? booking?.totalAmount ?? 0);
    if (pendingAmount <= 0) {
      throw new Error('No pending payment. This booking is already fully paid.');
    }

    setPendingPaymentSession({
      bookingId: booking._id,
      bookingCode: booking.bookingCode || bookingCode,
      name: booking.name || '',
      mobile: booking.mobile || mobile,
      payableTotal,
      pendingAmount
    });
    setCurrentPage('pending-payment');
  };

  const handlePendingPaymentSuccess = async () => {
    if (!pendingPaymentSession) {
      throw new Error('Pending payment session not found');
    }

    const response = await apiFetch(`/bookings/${pendingPaymentSession.bookingId}/pay-pending`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        paymentAmount: pendingPaymentSession.pendingAmount,
        bookingCode: pendingPaymentSession.bookingCode,
        mobile: pendingPaymentSession.mobile
      })
    });

    const result = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(result?.error || result?.message || 'Unable to complete pending payment');
    }
    const latestStatus = await requestPaymentApprovalFromServer(
      String(pendingPaymentSession.bookingId || ''),
      String(pendingPaymentSession.bookingCode || ''),
      String(pendingPaymentSession.mobile || '')
    );
    setApprovalWaitingBooking({
      id: String(pendingPaymentSession.bookingId || ''),
      code: String(pendingPaymentSession.bookingCode || ''),
      mobile: String(pendingPaymentSession.mobile || '')
    });
    setApprovalWaitingStatus(latestStatus);
    setApprovalWaitingContext('pending-payment');
    setCurrentPage('approval-waiting');
  };

  const handleBackToPaymentFromApproval = async () => {
    const hasApprovalRequest = Boolean(approvalWaitingBooking?.id);
    const isPending = !approvalWaitingStatus?.adminApproved && !approvalWaitingStatus?.adminRejected;

    if (hasApprovalRequest && isPending && approvalWaitingBooking) {
      const rejectionReason = 'Payment request rejected by user from Back to Payment';
      try {
        const rejectedStatus = await rejectPaymentRequestByUser(
          approvalWaitingBooking.id,
          approvalWaitingBooking.code,
          approvalWaitingBooking.mobile,
          rejectionReason
        );
        setApprovalWaitingStatus(rejectedStatus);
      } catch (error: any) {
        alert(error?.message || 'Unable to reject payment request on server');
        return;
      }
      alert('Payment request rejected and synced with admin panel.');
    }

    setCurrentPage(approvalWaitingContext === 'pending-payment' ? 'pending-payment' : 'payment');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage 
          bookingData={bookingData}
          hallImageUrls={hallImageUrls}
          setBookingData={setBookingData}
          onNext={() => setCurrentPage('booking')} 
          onBack={() => setCurrentPage('login')}
          onAdminLogin={() => setCurrentPage('admin-login')}
          onBookingDetails={() => setCurrentPage('booking-details-login')}
          onPendingPaymentLogin={() => setCurrentPage('pending-login')}
        />;
      case 'pending-login':
        return (
          <PendingPaymentLoginPage
            onBack={() => setCurrentPage('login')}
            onSubmit={handlePendingPaymentLogin}
          />
        );
      case 'pending-payment':
        return (
          <PendingPaymentPage
            session={pendingPaymentSession}
            onBack={() => setCurrentPage('pending-login')}
            onSuccess={async () => {
              await handlePendingPaymentSuccess();
            }}
          />
        );
      case 'booking':
        return (
          <BookingPage 
            bookingData={bookingData}
            setBookingData={setBookingData}
            onNext={() => setCurrentPage('summary')}
            onBack={() => setCurrentPage('login')}
          />
        );
      case 'summary':
        return (
          <PaymentSummaryPage
            bookingData={bookingData}
            setBookingData={setBookingData}
            onNext={() => setCurrentPage('payment')}
            onBack={() => setCurrentPage('booking')}
          />
        );
      case 'payment':
        return (
          <PaymentPage 
            amount={bookingData.paymentAmount + (bookingData.includeSecurityDeposit ? 500 : 0)}
            paymentProof={bookingData.profilePhoto}
            onPaymentProofChange={(proof) => setBookingData({ ...bookingData, profilePhoto: proof })}
            onSuccess={saveBookingToMongo}
            onBack={() => setCurrentPage('summary')}
          />
        );
      case 'approval-waiting':
        return (
          <PaymentApprovalWaitingPage
            bookingCode={approvalWaitingBooking?.code || bookingData.bookingCode}
            status={approvalWaitingStatus}
            onRefresh={() => {
              void refreshApprovalStatus();
            }}
            onBackToPayment={handleBackToPaymentFromApproval}
          />
        );
      case 'confirmation':
        return <ConfirmationPage bookingData={bookingData} saveError={saveError} onViewBookingDetails={() => setCurrentPage('booking-details-login')} onNewBooking={() => {
          setCurrentPage('login');
          setSaveError('');
          setApprovalWaitingBooking(null);
          setApprovalWaitingStatus(null);
          setApprovalWaitingContext('booking');
          setBookingData({ ...defaultBookingData });
        }} />;
      case 'booking-details-login':
        return (
          <BookingDetailsLookupPage
            onBack={() => setCurrentPage('confirmation')}
            onPayNow={async (bookingCode, mobile) => {
              await handlePendingPaymentLogin(bookingCode, mobile);
            }}
          />
        );
      case 'admin-login':
        return (
          <AdminLoginPage
            onBack={() => setCurrentPage('login')}
            onLoginSuccess={(token) => {
              setAdminToken(token);
              setIsAdminLoggedIn(true);
              window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
              window.sessionStorage.setItem('adminLoggedIn', 'true');
              setCurrentPage('admin-panel');
            }}
          />
        );
      case 'admin-panel':
        if (!isAdminLoggedIn || !adminToken) {
          return (
            <AdminLoginPage
              onBack={() => setCurrentPage('login')}
              onLoginSuccess={(token) => {
                setAdminToken(token);
                setIsAdminLoggedIn(true);
                window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
                window.sessionStorage.setItem('adminLoggedIn', 'true');
                setCurrentPage('admin-panel');
              }}
            />
          );
        }
        return (
          <AdminPanelPage
            hallImageUrls={hallImageUrls}
            setHallImageUrls={(nextImageUrls) => {
              setHallImageUrls(nextImageUrls.slice(0, 12));
              try {
                window.localStorage.setItem(HALL_IMAGE_LIST_STORAGE_KEY, JSON.stringify(nextImageUrls.slice(0, 12)));
                window.localStorage.setItem(HALL_IMAGE_STORAGE_KEY, nextImageUrls[0] || '');
              } catch {
                // ignore storage errors
              }
            }}
            onBackToBooking={() => setCurrentPage('login')}
            adminToken={adminToken}
            onLogout={() => {
              setIsAdminLoggedIn(false);
              setAdminToken('');
              window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
              window.sessionStorage.removeItem('adminLoggedIn');
              setCurrentPage('login');
            }}
          />
        );
      default:
        return <LoginPage 
          bookingData={bookingData}
          hallImageUrls={hallImageUrls}
          setBookingData={setBookingData}
          onNext={() => setCurrentPage('booking')} 
          onBack={() => setCurrentPage('login')}
          onAdminLogin={() => setCurrentPage('admin-login')}
          onBookingDetails={() => setCurrentPage('booking-details-login')}
          onPendingPaymentLogin={() => setCurrentPage('pending-login')}
        />;
    }
  };

  const isLoginPage = currentPage === 'login';
  const isBookingDetailsPage = currentPage === 'booking-details-login';

  return (
    <div className={`app-shell ${isLoginPage ? 'login-banner-shell' : isBookingDetailsPage ? 'booking-details-shell' : 'admin-shell'}`} style={{
      minHeight: '100vh',
      fontFamily: "'Sora', 'IBM Plex Sans', sans-serif"
    }}>
      {renderPage()}
    </div>
  );
};

// Login/Register Page
const LoginPage: React.FC<{ 
  bookingData: BookingData;
  hallImageUrls: string[];
  setBookingData: (data: BookingData) => void;
  onNext: () => void; 
  onBack: () => void;
  onAdminLogin: () => void;
  onBookingDetails: () => void;
  onPendingPaymentLogin: () => void;
}> = ({ bookingData, hallImageUrls, setBookingData, onNext, onBack, onAdminLogin, onBookingDetails, onPendingPaymentLogin }) => {
  const [isHallImageOpen, setIsHallImageOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  type SettingsTab = 'contact' | 'service' | 'booking' | 'complain' | 'feedback' | 'language';
  type AppLanguage = 'en' | 'hi';
  type SettingsProfile = { name: string; profileType: string; contact: string };
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab | null>(null);
  const [settingsContacts, setSettingsContacts] = useState<SettingsProfile[]>([]);
  const [settingsServiceProviders, setSettingsServiceProviders] = useState<SettingsProfile[]>([]);
  const [settingsBookedDates, setSettingsBookedDates] = useState<string[]>([]);
  const [settingsCalendarMonth, setSettingsCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [complainInput, setComplainInput] = useState('');
  const [complainBookingCode, setComplainBookingCode] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackPhone, setFeedbackPhone] = useState('');
  const [settingsStatusText, setSettingsStatusText] = useState('');
  const settingsMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('en');
  const settingItems = ['Admin', 'Language', 'Contact', 'Service', 'Check Date', 'Booking Detail', 'Pay', 'Complain', 'Feedback'];
  const languageText = {
    en: {
      back: 'Back',
      customerDetails: 'Guest Details',
      fullName: 'Full Name',
      fullNamePlaceholder: 'Enter your full name',
      mobileNumber: 'Mobile Number',
      mobilePlaceholder: 'Enter your 10-digit mobile number',
      purpose: 'Purpose',
      selectPurpose: 'Select purpose',
      enterPurpose: 'Enter purpose',
      gender: 'Gender',
      selectGender: 'Select gender',
      male: 'Male',
      female: 'Female',
      other: 'Other',
      emailOptional: 'Email (Optional)',
      emailPlaceholder: 'Enter email address',
      whatsapp: 'WhatsApp Notifications',
      continueBooking: 'Continue to Booking',
      pendingPaymentLogin: 'Pending Payment Login',
      language: 'Language',
      close: 'Close'
    },
    hi: {
      back: '????',
      customerDetails: 'Guest Details',
      fullName: '???? ???',
      fullNamePlaceholder: '???? ???? ??? ???? ????',
      mobileNumber: '?????? ????',
      mobilePlaceholder: '???? 10 ????? ?? ?????? ???? ???? ????',
      purpose: '????????',
      selectPurpose: '???????? ?????',
      enterPurpose: '???????? ?????',
      gender: '????',
      selectGender: '???? ?????',
      male: '?????',
      female: '?????',
      other: '????',
      emailOptional: '???? (????????)',
      emailPlaceholder: '???? ??? ???? ????',
      whatsapp: '????????? ???????',
      continueBooking: '?????? ???? ????',
      pendingPaymentLogin: '????? ?????? ?????',
      language: '????',
      close: '??? ????'
    }
  } as const;
  const t = languageText[selectedLanguage];
  const hallSlides = hallImageUrls;
  const [hallSlideIndex, setHallSlideIndex] = useState(0);
  const purposeOptions = ['meeting', 'camp', 'picnic', 'function', 'shaadi', 'engagement', 'reception', 'stay'] as const;
  type PurposeOption = '' | (typeof purposeOptions)[number] | 'other';
  const initialPurpose = bookingData.purpose.trim().toLowerCase();
  const [purposeOption, setPurposeOption] = useState<PurposeOption>(() => {
    if (!initialPurpose) return 'stay';
    return (purposeOptions as readonly string[]).includes(initialPurpose) ? (initialPurpose as PurposeOption) : 'other';
  });
  const [customPurpose, setCustomPurpose] = useState<string>(() =>
    (purposeOptions as readonly string[]).includes(initialPurpose) ? '' : bookingData.purpose
  );

  React.useEffect(() => {
    if (hallSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setHallSlideIndex((prev) => (prev + 1) % hallSlides.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [hallSlides.length]);

  React.useEffect(() => {
    if (!hallSlides.length) {
      setIsHallImageOpen(false);
      setHallSlideIndex(0);
      return;
    }
    if (hallSlideIndex >= hallSlides.length) {
      setHallSlideIndex(0);
    }
  }, [hallSlideIndex, hallSlides.length]);

  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!settingsMenuRef.current) return;
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const getStoredProfiles = (key: string) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [] as SettingsProfile[];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [] as SettingsProfile[];
      return parsed
        .map((item) => ({
          name: String(item?.name || ''),
          profileType: String(item?.profileType || ''),
          contact: String(item?.contact || '')
        }))
        .filter((item) => item.name || item.profileType || item.contact);
    } catch {
      return [] as SettingsProfile[];
    }
  };

  const getDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const openSettingsTab = (item: string) => {
    if (item.toLowerCase() === 'admin') {
      setIsSettingsOpen(false);
      onAdminLogin();
      return;
    }
    if (item.toLowerCase() === 'booking detail') {
      setIsSettingsOpen(false);
      onBookingDetails();
      return;
    }
    if (item.toLowerCase() === 'pay') {
      setIsSettingsOpen(false);
      onPendingPaymentLogin();
      return;
    }
    if (item.toLowerCase() === 'check date') {
      setIsSettingsOpen(false);
      setSettingsStatusText('');
      const now = new Date();
      setSettingsCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      setActiveSettingsTab('booking');
      return;
    }

    const tabMap: Record<string, SettingsTab> = {
      language: 'language',
      contact: 'contact',
      service: 'service',
      complain: 'complain',
      feedback: 'feedback'
    };
    const nextTab = tabMap[item.toLowerCase()];
    if (!nextTab) return;
    setIsSettingsOpen(false);
    setSettingsStatusText('');
    if (nextTab === 'feedback') {
      setFeedbackName(bookingData.name || '');
      setFeedbackPhone(bookingData.mobile || '');
    }
    setActiveSettingsTab(nextTab);
  };

  React.useEffect(() => {
    if (activeSettingsTab === 'contact') {
      setSettingsContacts(getStoredProfiles('adminContactList'));
      return;
    }
    if (activeSettingsTab === 'service') {
      setSettingsServiceProviders(getStoredProfiles('adminServiceProviderList'));
      return;
    }
    if (activeSettingsTab && activeSettingsTab !== 'booking') return;

    const loadBookedDates = async () => {
      try {
        const response = await apiFetch('/bookings');
        const result = await parseJsonSafe(response);
        if (!response.ok) {
          throw new Error(result?.error || result?.message || 'Unable to load booking calendar');
        }
        const reserved = new Set<string>();
        (result.bookings || []).forEach((booking: any) => {
          if (booking?.status === 'canceled') return;
          const checkin = booking?.checkinDate ? new Date(booking.checkinDate) : null;
          const checkout = booking?.checkoutDate ? new Date(booking.checkoutDate) : null;
          if (checkin && checkout && !Number.isNaN(checkin.getTime()) && !Number.isNaN(checkout.getTime()) && checkout > checkin) {
            const cursor = new Date(checkin);
            while (cursor < checkout) {
              reserved.add(cursor.toISOString().split('T')[0]);
              cursor.setDate(cursor.getDate() + 1);
            }
          }
        });
        setSettingsBookedDates(Array.from(reserved));
      } catch {
        setSettingsBookedDates([]);
      }
    };

    void loadBookedDates();
  }, [activeSettingsTab]);

  const toTelHref = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7) return null;
    return `tel:${digits}`;
  };

  const submitPublicMessage = async (type: 'complain' | 'feedback') => {
    const text = (type === 'complain' ? complainInput : feedbackInput).trim();
    if (!text) {
      setSettingsStatusText(`Please enter ${type} details`);
      return;
    }
    if (type === 'complain' && !complainBookingCode.trim()) {
      setSettingsStatusText('Allotment No. is mandatory for complain');
      return;
    }
    if (type === 'feedback' && !feedbackName.trim()) {
      setSettingsStatusText('Please enter name for feedback');
      return;
    }
    if (type === 'feedback' && !feedbackPhone.trim()) {
      setSettingsStatusText('Please enter phone number for feedback');
      return;
    }

    const key = type === 'complain' ? 'publicComplainList' : 'publicFeedbackList';
    try {
      const existingRaw = window.localStorage.getItem(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const safeExisting = Array.isArray(existing) ? existing : [];
      if (type === 'complain') {
        const code = complainBookingCode.trim();
        let guestName = bookingData.name || 'Guest';
        let guestMobile = bookingData.mobile || '';
        try {
          const response = await apiFetch('/bookings');
          const result = await parseJsonSafe(response);
          if (!response.ok) {
            throw new Error(result?.error || result?.message || 'Unable to verify Allotment No.');
          }
          const matched = (result?.bookings || []).find((booking: any) => String(booking?.bookingCode || '') === code);
          if (!matched) {
            setSettingsStatusText('Allotment No. not found. Please enter a valid Allotment No.');
            return;
          }
          guestName = String(matched?.name || guestName);
          guestMobile = String(matched?.mobile || guestMobile);
        } catch {
          setSettingsStatusText('Unable to verify Allotment No. right now. Please try again.');
          return;
        }

        const complainEntry = {
          id: `cmp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: guestName,
          mobile: guestMobile,
          bookingCode: complainBookingCode.trim(),
          message: text,
          createdAt: new Date().toISOString(),
          status: 'open'
        };
        window.localStorage.setItem(key, JSON.stringify([complainEntry, ...safeExisting].slice(0, 100)));
      } else {
        const feedbackEntry = {
          id: `fb_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: feedbackName.trim(),
          phone: feedbackPhone.trim(),
          message: text,
          createdAt: new Date().toISOString()
        };
        window.localStorage.setItem(key, JSON.stringify([feedbackEntry, ...safeExisting].slice(0, 100)));
      }
      if (type === 'complain') setComplainInput('');
      if (type === 'complain') setComplainBookingCode('');
      if (type === 'feedback') {
        setFeedbackInput('');
        setFeedbackName('');
        setFeedbackPhone('');
      }
      setSettingsStatusText(`${type === 'complain' ? 'Complain' : 'Feedback'} submitted successfully`);
    } catch {
      setSettingsStatusText(`Unable to submit ${type}. Please try again.`);
    }
  };

  const renderSettingsCalendar = () => {
    const year = settingsCalendarMonth.getFullYear();
    const month = settingsCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const cells: React.ReactNode[] = [];

    for (let i = 0; i < startWeekDay; i++) cells.push(<div key={`settings-blank-${i}`} />);

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const key = getDateKey(date);
      const isBooked = settingsBookedDates.includes(key);
      cells.push(
        <div
          key={key}
          className={`calendar-day-card settings-day-card ${isBooked ? 'is-booked' : 'is-available'}`}
          style={{
            minHeight: '74px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '6px',
            background: isBooked ? '#dc2626' : '#f8fafc'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: isBooked ? '#fff' : '#0f172a' }}>{day}</div>
          <div className="calendar-day-sub" style={{ fontSize: '0.68rem', color: isBooked ? '#fff' : '#64748b', marginTop: '4px' }}>
            {isBooked ? 'Booked' : 'Available'}
          </div>
        </div>
      );
    }

    return cells;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate name
    if (!bookingData.name.trim()) {
      alert('Please enter your full name');
      return;
    }
    
    // Validate mobile number
    if (!bookingData.mobile.trim()) {
      alert('Please enter your mobile number');
      return;
    }

    if (!bookingData.purpose.trim()) {
      alert('Please select purpose');
      return;
    }

    if (!bookingData.gender) {
      alert('Please select gender');
      return;
    }
    
    if (bookingData.mobile.length !== 10) {
      alert('Mobile number must be exactly 10 digits');
      return;
    }
    
    if (!/^[0-9]+$/.test(bookingData.mobile)) {
      alert('Mobile number should contain only numbers');
      return;
    }

    onNext();
  };
  
  // Function to capitalize each word
  const capitalizeWords = (str: string) => {
    return str.replace(/\b\w/g, (char) => char.toUpperCase());
  };
  
  // Function to handle name input with auto-capitalization
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow letters and spaces
    const filteredValue = value.replace(/[^a-zA-Z\s]/g, '');
    // Capitalize first letter of each word
    const capitalizedValue = capitalizeWords(filteredValue);
    setBookingData({ ...bookingData, name: capitalizedValue });
  };
  
  // Function to handle mobile input with digit restriction
  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers and limit to 10 digits
    const filteredValue = value.replace(/[^0-9]/g, '').slice(0, 10);
    setBookingData({ ...bookingData, mobile: filteredValue });
  };
  
  return (
    <div className="page-center travel-page" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="surface-card customer-shell" style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '40px',
        maxWidth: '450px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
      }}>
        <div className="card-topbar booking-navbar" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div ref={settingsMenuRef} className="settings-wrap" style={{ position: 'relative', justifySelf: 'start' }}>
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className="settings-btn booking-navbar-settings-btn"
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '999px',
                background: '#f8fafc',
                color: '#0f172a',
                cursor: 'pointer',
                padding: '0 12px',
                minWidth: '84px',
                height: '42px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span style={{ fontSize: '0.86rem', fontWeight: 700 }}>Menu</span>
            </button>
            {isSettingsOpen && (
              <div
                className="settings-menu"
                style={{
                  position: 'absolute',
                  top: '48px',
                  left: 0,
                  minWidth: '190px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  boxShadow: '0 12px 28px rgba(2, 6, 23, 0.18)',
                  padding: '6px',
                  zIndex: 50
                }}
              >
                {settingItems.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => openSettingsTab(item)}
                    className="settings-menu-item"
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#0f172a',
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="booking-navbar-title" style={{ textAlign: 'center', fontWeight: 700, color: '#111827', fontSize: '1.45rem' }}>
            Booking Details
          </div>

          <div style={{ width: '98px', height: '42px', justifySelf: 'end' }} />
        </div>

        <button
          type="button"
          onClick={() => openSettingsTab('Check Date')}
          style={{
            width: '100%',
            marginBottom: '14px',
            border: '1px solid #bfdbfe',
            borderRadius: '14px',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            color: '#1d4ed8',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 700
          }}
        >
          Check Date
        </button>

        {hallSlides.length > 0 && (
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div
              className="hall-hero-frame"
              style={{
                position: 'relative',
                width: '100%',
                minHeight: '200px',
                boxSizing: 'border-box',
                marginBottom: '15px',
                borderRadius: '16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.55)',
                overflow: 'hidden'
              }}
            >
              <img
                className="hall-hero-image"
                src={hallSlides[hallSlideIndex]}
                alt="Hall/Room View"
                onClick={() => setIsHallImageOpen(true)}
                style={{
                  width: '100%',
                  height: '200px',
                  objectFit: 'cover',
                  objectPosition: 'center 35%',
                  display: 'block',
                  cursor: 'zoom-in'
                }}
              />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', padding: '10px 0', background: '#f8fafc' }}>
                {hallSlides.map((_, idx) => (
                  <span
                    key={`login-slide-dot-${idx}`}
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '999px',
                      background: idx === hallSlideIndex ? '#1d4ed8' : '#cbd5e1',
                      display: 'inline-block'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              background: 'linear-gradient(165deg, rgba(241,247,241,0.9) 0%, rgba(229,241,244,0.9) 48%, rgba(236,239,253,0.9) 100%)',
              border: '1px solid rgba(203,213,225,0.8)',
              borderRadius: '22px',
              padding: '16px 12px 14px',
              boxShadow: '0 10px 24px rgba(15,23,42,0.08)'
            }}
          >
            <h3 style={{ margin: '0 0 14px 0', color: '#1f2937', textAlign: 'center', fontSize: '1.45rem', fontWeight: 500 }}>
              {t.customerDetails}
            </h3>

            <div style={{ marginBottom: '9px', border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: '14px', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" fill="#4e7c75" />
                  <path d="M3.5 20C4.6 15.9 7.7 14 12 14C16.3 14 19.4 15.9 20.5 20" fill="#4e7c75" />
                </svg>
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1f2937', marginBottom: '1px' }}>{t.fullName}</div>
                  <input
                    type="text"
                    value={bookingData.name}
                    onChange={handleNameChange}
                    placeholder={t.fullNamePlaceholder}
                    style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#4b5563', fontSize: '0.92rem', padding: 0 }}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '9px', border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: '14px', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21 16.9V20a2 2 0 0 1-2.2 2A18.6 18.6 0 0 1 10.7 19a18.1 18.1 0 0 1-5.7-5.7A18.6 18.6 0 0 1 2 5.2 2 2 0 0 1 4 3h3.1a2 2 0 0 1 2 1.7c.1.8.3 1.6.6 2.3a2 2 0 0 1-.4 2.1L8 10.8a16 16 0 0 0 5.2 5.2l1.7-1.3a2 2 0 0 1 2.1-.4c.7.3 1.5.5 2.3.6a2 2 0 0 1 1.7 2z" fill="#4e7c75" />
                </svg>
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1f2937', marginBottom: '1px' }}>{t.mobileNumber}</div>
                  <input
                    type="tel"
                    value={bookingData.mobile}
                    onChange={handleMobileChange}
                    placeholder={t.mobilePlaceholder}
                    maxLength={10}
                    style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#4b5563', fontSize: '0.92rem', padding: 0 }}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '9px', border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: '14px', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="3" fill="#4e7c75" />
                  <rect x="6" y="9" width="12" height="2" fill="#e5f7f1" />
                </svg>
                <select
                  value={purposeOption}
                  onChange={(e) => {
                    const selected = e.target.value as PurposeOption;
                    setPurposeOption(selected);
                    if (selected === '') {
                      setCustomPurpose('');
                      setBookingData({ ...bookingData, purpose: '' });
                      return;
                    }
                    if (selected === 'other') {
                      setBookingData({ ...bookingData, purpose: customPurpose.trim() });
                      return;
                    }
                    setCustomPurpose('');
                    setBookingData({ ...bookingData, purpose: selected });
                  }}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#1f2937', fontSize: '0.95rem', fontWeight: 600, padding: 0 }}
                  required
                >
                  <option value="">{t.selectPurpose}</option>
                  <option value="meeting">{selectedLanguage === 'hi' ? '??????' : 'Meeting'}</option>
                  <option value="camp">{selectedLanguage === 'hi' ? '????' : 'Camp'}</option>
                  <option value="picnic">{selectedLanguage === 'hi' ? '??????' : 'Picnic'}</option>
                  <option value="function">{selectedLanguage === 'hi' ? '??????' : 'Function'}</option>
                  <option value="shaadi">{selectedLanguage === 'hi' ? '????' : 'Shaadi'}</option>
                  <option value="engagement">{selectedLanguage === 'hi' ? '????' : 'Engagement'}</option>
                  <option value="reception">{selectedLanguage === 'hi' ? '????????' : 'Reception'}</option>
                  <option value="stay">{selectedLanguage === 'hi' ? '????' : 'Stay'}</option>
                  <option value="other">{t.other}</option>
                </select>
              </div>
            </div>

            {purposeOption === 'other' && (
              <div style={{ marginBottom: '9px', border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: '14px', padding: '8px 10px' }}>
                <input
                  type="text"
                  value={customPurpose}
                  onChange={(e) => {
                    setCustomPurpose(e.target.value);
                    setBookingData({ ...bookingData, purpose: e.target.value });
                  }}
                  placeholder={t.enterPurpose}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#4b5563', fontSize: '0.92rem', padding: 0 }}
                  required
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '9px' }}>
              <div style={{ border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: '14px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" fill="#4e7c75" />
                  <path d="M4.5 20C5.4 16.5 8.1 14.8 12 14.8C15.9 14.8 18.6 16.5 19.5 20" fill="#4e7c75" />
                </svg>
                <span style={{ fontSize: '0.92rem', color: '#1f2937', fontWeight: 600 }}>{t.gender}</span>
              </div>
              <div style={{ border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: '14px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" fill="#4e7c75" />
                  <path d="M4.5 20C5.4 16.5 8.1 14.8 12 14.8C15.9 14.8 18.6 16.5 19.5 20" fill="#4e7c75" />
                </svg>
                <select
                  value={bookingData.gender}
                  onChange={(e) => setBookingData({ ...bookingData, gender: e.target.value as '' | 'male' | 'female' | 'other' })}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#1f2937', fontSize: '0.92rem', fontWeight: 600, padding: 0 }}
                  required
                >
                  <option value="">{t.selectGender}</option>
                  <option value="male">{t.male}</option>
                  <option value="female">{t.female}</option>
                  <option value="other">{t.other}</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '9px', border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: '14px', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="2" y="5" width="20" height="14" rx="3" fill="#4e7c75" />
                  <path d="M4 8L12 13L20 8" stroke="#e8f4ef" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  type="email"
                  value={bookingData.email}
                  onChange={(e) => setBookingData({ ...bookingData, email: e.target.value })}
                  placeholder={t.emailPlaceholder}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#4b5563', fontSize: '0.92rem', padding: 0 }}
                />
              </div>
            </div>

            <label style={{ marginBottom: '10px', border: '1px solid #d1d5db', background: '#edf4f2', borderRadius: '14px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={bookingData.whatsappNotification}
                onChange={(e) => setBookingData({ ...bookingData, whatsappNotification: e.target.checked })}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '0.92rem', color: '#1f2937', fontWeight: 600 }}>{t.whatsapp}</span>
              </div>
              <span style={{ width: '46px', height: '24px', borderRadius: '999px', background: bookingData.whatsappNotification ? '#2ea26f' : '#9ca3af', position: 'relative', transition: 'background 0.2s ease' }}>
                <span style={{ position: 'absolute', top: '3px', left: bookingData.whatsappNotification ? '24px' : '3px', width: '18px', height: '18px', borderRadius: '999px', background: '#fff', transition: 'left 0.2s ease' }} />
              </span>
            </label>

            <button
              className="primary-cta"
              type="submit"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #5667e8 0%, #7b39cf 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                padding: '14px 18px',
                fontSize: '1.28rem',
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: '0 8px 16px rgba(88, 70, 220, 0.25)'
              }}
            >
              {t.continueBooking}
            </button>
          </div>
          <button
            className="secondary-cta"
            type="button"
            onClick={onPendingPaymentLogin}
            style={{
              width: '100%',
              marginTop: '12px',
              background: '#fff',
              color: '#1e293b',
              border: '2px solid #cbd5e1',
              borderRadius: '15px',
              padding: '14px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {t.pendingPaymentLogin}
          </button>
        </form>
      </div>
      {activeSettingsTab && (
        <div
          onClick={() => setActiveSettingsTab(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.58)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '14px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '88vh',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #dbeafe',
              boxShadow: '0 24px 48px rgba(2, 6, 23, 0.32)',
              padding: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#0f172a', textTransform: 'capitalize' }}>
                {activeSettingsTab === 'booking'
                  ? 'Check Date'
                  : activeSettingsTab === 'language'
                    ? 'Language'
                    : activeSettingsTab}
              </h3>
              <button
                type="button"
                onClick={() => setActiveSettingsTab(null)}
                style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', fontWeight: 700 }}
              >
                {t.close}
              </button>
            </div>

            {activeSettingsTab === 'language' && (
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ color: '#334155', fontSize: '0.9rem' }}>Choose language</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage('en')}
                    style={{ border: selectedLanguage === 'en' ? '2px solid #1d4ed8' : '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: 700 }}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage('hi')}
                    style={{ border: selectedLanguage === 'hi' ? '2px solid #1d4ed8' : '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ??????
                  </button>
                </div>
              </div>
            )}

            {activeSettingsTab === 'contact' && (
              <div style={{ display: 'grid', gap: '8px' }}>
                {settingsContacts.length ? settingsContacts.map((entry, idx) => (
                  <div key={`public-contact-${idx}`} style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '10px', background: '#f8fbff' }}>
                    <div style={{ fontWeight: 700, color: '#1e3a8a' }}>{entry.name || 'Contact'}</div>
                    <div style={{ color: '#334155', fontSize: '0.88rem', marginTop: '2px' }}>{entry.profileType || 'Profile'}</div>
                    <div style={{ color: '#0f172a', marginTop: '6px' }}>{entry.contact || '-'}</div>
                    {toTelHref(entry.contact) && (
                      <a
                        href={toTelHref(entry.contact) || '#'}
                        style={{ display: 'inline-block', marginTop: '8px', textDecoration: 'none', background: '#16a34a', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.86rem' }}
                      >
                        Call
                      </a>
                    )}
                  </div>
                )) : (
                  <div style={{ color: '#64748b' }}>No contact details available.</div>
                )}
              </div>
            )}

            {activeSettingsTab === 'service' && (
              <div style={{ display: 'grid', gap: '8px' }}>
                {settingsServiceProviders.length ? settingsServiceProviders.map((entry, idx) => (
                  <div key={`public-service-${idx}`} style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '10px', background: '#f8fbff' }}>
                    <div style={{ fontWeight: 700, color: '#1e3a8a' }}>{entry.name || 'Provider'}</div>
                    <div style={{ color: '#334155', fontSize: '0.88rem', marginTop: '2px' }}>{entry.profileType || 'Service Type'}</div>
                    <div style={{ color: '#0f172a', marginTop: '6px' }}>{entry.contact || '-'}</div>
                    {toTelHref(entry.contact) && (
                      <a
                        href={toTelHref(entry.contact) || '#'}
                        style={{ display: 'inline-block', marginTop: '8px', textDecoration: 'none', background: '#16a34a', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.86rem' }}
                      >
                        Call
                      </a>
                    )}
                  </div>
                )) : (
                  <div style={{ color: '#64748b' }}>No service provider details available.</div>
                )}
              </div>
            )}

            {activeSettingsTab === 'booking' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSettingsCalendarMonth(new Date(settingsCalendarMonth.getFullYear(), settingsCalendarMonth.getMonth() - 1, 1))}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', background: '#f8fafc', cursor: 'pointer' }}
                  >
                    Prev
                  </button>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    {settingsCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsCalendarMonth(new Date(settingsCalendarMonth.getFullYear(), settingsCalendarMonth.getMonth() + 1, 1))}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', background: '#f8fafc', cursor: 'pointer' }}
                  >
                    Next
                  </button>
                </div>
                <div className="calendar-weekdays-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px', marginBottom: '6px', fontSize: '0.73rem', fontWeight: 700, color: '#475569' }}>
                  <div style={{ textAlign: 'center' }}>Sun</div>
                  <div style={{ textAlign: 'center' }}>Mon</div>
                  <div style={{ textAlign: 'center' }}>Tue</div>
                  <div style={{ textAlign: 'center' }}>Wed</div>
                  <div style={{ textAlign: 'center' }}>Thu</div>
                  <div style={{ textAlign: 'center' }}>Fri</div>
                  <div style={{ textAlign: 'center' }}>Sat</div>
                </div>
                <div className="calendar-days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
                  {renderSettingsCalendar()}
                </div>
              </div>
            )}

            {(activeSettingsTab === 'complain' || activeSettingsTab === 'feedback') && (
              <div>
                {activeSettingsTab === 'complain' && (
                  <input
                    value={complainBookingCode}
                    onChange={(e) => setComplainBookingCode(e.target.value.replace(/\s+/g, '').slice(0, 20))}
                    placeholder="Allotment No. (mandatory)"
                    style={{ width: '100%', marginBottom: '8px', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '10px', boxSizing: 'border-box' }}
                  />
                )}
                {activeSettingsTab === 'feedback' && (
                  <>
                    <input
                      value={feedbackName}
                      onChange={(e) => setFeedbackName(e.target.value)}
                      placeholder="Name"
                      style={{ width: '100%', marginBottom: '8px', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '10px', boxSizing: 'border-box' }}
                    />
                    <input
                      value={feedbackPhone}
                      onChange={(e) => setFeedbackPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Phone Number"
                      style={{ width: '100%', marginBottom: '8px', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '10px', boxSizing: 'border-box' }}
                    />
                  </>
                )}
                <textarea
                  value={activeSettingsTab === 'complain' ? complainInput : feedbackInput}
                  onChange={(e) => activeSettingsTab === 'complain' ? setComplainInput(e.target.value) : setFeedbackInput(e.target.value)}
                  placeholder={activeSettingsTab === 'complain' ? 'Write your complain' : 'Write your feedback'}
                  rows={5}
                  style={{ width: '100%', resize: 'vertical', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '10px', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await submitPublicMessage(activeSettingsTab);
                  }}
                  style={{ marginTop: '10px', border: 'none', borderRadius: '8px', padding: '9px 12px', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Submit
                </button>
              </div>
            )}

            {settingsStatusText && (
              <div style={{ marginTop: '10px', background: '#ecfeff', border: '1px solid #bae6fd', color: '#155e75', borderRadius: '8px', padding: '8px', fontSize: '0.85rem' }}>
                {settingsStatusText}
              </div>
            )}
          </div>
        </div>
      )}
      {isHallImageOpen && hallSlides.length > 0 && (
        <div
          onClick={() => setIsHallImageOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.82)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 'min(1200px, 96vw)',
              maxHeight: '92vh',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'transparent'
            }}
          >
            <img
              src={hallSlides[hallSlideIndex]}
              alt="Hall/Room View Full"
              style={{
                width: '100%',
                height: '100%',
                maxHeight: '92vh',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const PendingPaymentLoginPage: React.FC<{
  onBack: () => void;
  onSubmit: (bookingCode: string, mobile: string) => Promise<void>;
}> = ({ onBack, onSubmit }) => {
  const [bookingCode, setBookingCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanCode = bookingCode.replace(/\D/g, '').slice(0, 4);
    const cleanMobile = mobile.replace(/\D/g, '').slice(0, 10);
    if (cleanCode.length !== 4) {
      setError('Please enter your 4-digit Allotment No.');
      return;
    }
    if (cleanMobile.length !== 10) {
      setError('Please enter your 10-digit mobile number');
      return;
    }

    try {
      setLoading(true);
      await onSubmit(cleanCode, cleanMobile);
    } catch (err: any) {
      setError(err?.message || 'Unable to verify pending booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="surface-card" style={{ background: 'rgba(255, 255, 255, 0.95)', borderRadius: '20px', padding: '32px', maxWidth: '440px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
        <button
          onClick={onBack}
          className="compact-back-btn"
          style={{ background: 'none', border: 'none', fontSize: '0.92rem', cursor: 'pointer', marginBottom: '16px', color: '#475569', fontWeight: 600 }}
        >
          ? Back
        </button>
        <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Pending Payment Login</h2>
        <p style={{ margin: '0 0 20px 0', color: '#475569' }}>Login with your 4-digit Allotment No. and mobile number.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#0f172a', fontWeight: 600 }}>Allotment No. (4 digits)</label>
            <input
              type="text"
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              placeholder="e.g. 4721"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              required
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#0f172a', fontWeight: 600 }}>Mobile Number</label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              placeholder="10-digit mobile number"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              required
            />
          </div>

          {error && (
            <div style={{ marginBottom: '12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1 }}
          >
            {loading ? 'Verifying...' : 'Login for Pending Payment'}
          </button>
        </form>
      </div>
    </div>
  );
};

const PendingPaymentPage: React.FC<{
  session: PendingPaymentSession | null;
  onBack: () => void;
  onSuccess: () => Promise<void>;
}> = ({ session, onBack, onSuccess }) => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  if (!session) {
    return (
      <div className="page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '100%' }}>
          <p style={{ margin: '0 0 12px 0', color: '#334155' }}>Pending payment session expired.</p>
          <button onClick={onBack} className="compact-back-btn" style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600 }}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const handleComplete = async () => {
    setError('');
    try {
      setProcessing(true);
      await onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Unable to complete pending payment');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="surface-card" style={{ background: 'rgba(255, 255, 255, 0.96)', borderRadius: '20px', padding: '32px', maxWidth: '460px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        <button
          onClick={onBack}
          className="compact-back-btn"
          style={{ background: 'none', border: 'none', fontSize: '0.92rem', cursor: 'pointer', marginBottom: '16px', color: '#475569', fontWeight: 600 }}
        >
          Back
        </button>
        <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Pending Payment Details</h2>
        <p style={{ margin: '0 0 20px 0', color: '#475569' }}>Review your booking details and submit payment request. Payment will be confirmed after admin approval.</p>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ marginBottom: '8px', color: '#0f172a' }}><strong>Name:</strong> {session.name}</div>
          <div style={{ marginBottom: '8px', color: '#0f172a' }}><strong>Allotment No.:</strong> {session.bookingCode}</div>
          <div style={{ marginBottom: '8px', color: '#0f172a' }}><strong>Mobile:</strong> {session.mobile}</div>
          <div style={{ marginBottom: '8px', color: '#0f172a' }}><strong>Total Payable:</strong> Rs {session.payableTotal}</div>
          <div style={{ color: '#166534', fontWeight: 700 }}><strong>Pending Amount:</strong> Rs {session.pendingAmount}</div>
        </div>

        {error && (
          <div style={{ marginBottom: '12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleComplete}
          disabled={processing}
          style={{ width: '100%', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: 'white', border: 'none', borderRadius: '12px', padding: '13px', fontSize: '1rem', fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.8 : 1 }}
        >
          {processing ? 'Submitting Payment Request...' : `Pay Rs ${session.pendingAmount} and Request Admin Approval`}
        </button>
      </div>
    </div>
  );
};

// Booking Details
const BookingPage: React.FC<{
  bookingData: BookingData;
  setBookingData: (data: BookingData) => void;
  onNext: () => void;
  onBack: () => void;
}> = ({ bookingData, setBookingData, onNext, onBack }) => {
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [bookingAvailabilityError, setBookingAvailabilityError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Calculate total amount based on dates
  const calculateTotalAmount = (checkinDate: string, checkoutDate: string) => {
    if (!checkinDate || !checkoutDate) return 3500; // Default amount
    
    const checkin = new Date(checkinDate);
    const checkout = new Date(checkoutDate);
    const diffTime = Math.abs(checkout.getTime() - checkin.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Base rate: Rs 3500 per day
    const baseRate = 3500;
    const totalAmount = Math.max(diffDays * baseRate, 3500); // Minimum Rs 3500
    
    return totalAmount;
  };
  
  // Calculate minimum advance payment
  const calculateMinAdvance = (totalAmount: number, days: number) => {
    if (days <= 1) {
      return 1000; // Single day minimum Rs 1000
    } else {
      return Math.ceil(totalAmount * 0.3); // 30% for multiple days
    }
  };
  
  // Update total amount when dates change
  React.useEffect(() => {
    if (bookingData.checkinDate && bookingData.checkoutDate) {
      const checkin = new Date(bookingData.checkinDate);
      const checkout = new Date(bookingData.checkoutDate);
      const days = Math.ceil(Math.abs(checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
      const newTotalAmount = calculateTotalAmount(bookingData.checkinDate, bookingData.checkoutDate);
      const minAdvance = calculateMinAdvance(newTotalAmount, days);
      
      setBookingData({ 
        ...bookingData, 
        totalAmount: newTotalAmount,
        // Reset payment amount if it exceeds new total or below minimum
        paymentAmount: bookingData.paymentType === 'full' ? newTotalAmount : 
                      bookingData.paymentType === 'advance' ? minAdvance :
                      bookingData.paymentType === 'custom' && (bookingData.paymentAmount > newTotalAmount || bookingData.paymentAmount < minAdvance) ? minAdvance : bookingData.paymentAmount,
        customAmount: Math.max(minAdvance, Math.min(bookingData.customAmount, newTotalAmount))
      });
    }
  }, [bookingData.checkinDate, bookingData.checkoutDate]);

  const isDateBooked = (date: string) => bookedDates.includes(date);
  const getDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const getDateAfterDaysKey = (dateKey: string, daysToAdd: number) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day);
    targetDate.setDate(targetDate.getDate() + daysToAdd);
    return getDateKey(targetDate);
  };

  const isCheckoutDateAllowed = (checkinDate: string, checkoutDate: string) => {
    if (!checkinDate || !checkoutDate) return false;
    return checkoutDate > checkinDate;
  };

  const hasBookedDateInBetween = (checkinDate: string, checkoutDate: string) => {
    if (!isCheckoutDateAllowed(checkinDate, checkoutDate)) return false;
    const cursor = new Date(checkinDate);
    const end = new Date(checkoutDate);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < end) {
      const dateKey = cursor.toISOString().split('T')[0];
      if (isDateBooked(dateKey)) return true;
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  };

  React.useEffect(() => {
    const loadBookedDates = async () => {
      setBookingAvailabilityError('');
      try {
        const response = await apiFetch('/bookings');
        const result = await parseJsonSafe(response);
        if (!response.ok) {
          throw new Error(result?.error || result?.message || 'Unable to load booked dates');
        }

        const reserved = new Set<string>();
        (result.bookings || []).forEach((booking: any) => {
          if (booking?.status === 'canceled') return;
          const checkin = booking?.checkinDate ? new Date(booking.checkinDate) : null;
          const checkout = booking?.checkoutDate ? new Date(booking.checkoutDate) : null;

          if (checkin && checkout && !Number.isNaN(checkin.getTime()) && !Number.isNaN(checkout.getTime()) && checkout > checkin) {
            const cursor = new Date(checkin);
            while (cursor < checkout) {
              const bookedDate = cursor.toISOString().split('T')[0];
              reserved.add(bookedDate);
              cursor.setDate(cursor.getDate() + 1);
            }
            return;
          }

          if (booking?.bookingDate) {
            const singleDate = new Date(booking.bookingDate);
            if (!Number.isNaN(singleDate.getTime())) {
              const bookedDate = singleDate.toISOString().split('T')[0];
              reserved.add(bookedDate);
            }
          }
        });

        setBookedDates(Array.from(reserved));
      } catch (error: any) {
        setBookingAvailabilityError(error?.message || 'Unable to load booked dates');
      }
    };

    loadBookedDates();
  }, []);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bookingData.checkinDate && bookingData.checkoutDate) {
      if (new Date(bookingData.checkinDate) >= new Date(bookingData.checkoutDate)) {
        alert('Check-out date must be after check-in date');
        return;
      }
      onNext();
    } else {
      alert('Please select both check-in and check-out dates');
    }
  };

  // Generate available dates (next 120 days to cover through March)
  const getAvailableDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 120; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  };

  const availableDates = getAvailableDates();
  const availableDatesSet = new Set(availableDates);
  const getStayDays = (checkinDate: string, checkoutDate: string) => {
    if (!checkinDate || !checkoutDate) return 0;
    return Math.max(
      Math.ceil(
        Math.abs(new Date(checkoutDate).getTime() - new Date(checkinDate).getTime()) / (1000 * 60 * 60 * 24)
      ),
      1
    );
  };
  const resolveCheckoutForDays = (checkinDate: string, days: number) => {
    if (!checkinDate) return '';
    const safeDays = Math.max(1, Math.floor(days));
    const candidateCheckout = getDateAfterDaysKey(checkinDate, safeDays);
    if (!availableDatesSet.has(candidateCheckout)) return '';
    if (hasBookedDateInBetween(checkinDate, candidateCheckout)) return '';
    return candidateCheckout;
  };

  const updateCheckinDate = (newCheckinDate: string) => {
    if (!newCheckinDate) {
      setBookingData({ ...bookingData, checkinDate: '', checkoutDate: '' });
      return;
    }
    if (isDateBooked(newCheckinDate)) {
      alert('Selected check-in date is already booked');
      return;
    }

    const previousDayCount = getStayDays(bookingData.checkinDate, bookingData.checkoutDate) || 1;
    const autoCheckoutDate =
      resolveCheckoutForDays(newCheckinDate, previousDayCount) || resolveCheckoutForDays(newCheckinDate, 1);
    const newData = {
      ...bookingData,
      checkinDate: newCheckinDate,
      checkoutDate: autoCheckoutDate
    };
    setBookingData(newData);
  };

  const updateCheckoutDate = (candidateCheckout: string) => {
    if (!candidateCheckout) {
      setBookingData({ ...bookingData, checkoutDate: '' });
      return;
    }
    if (!bookingData.checkinDate) {
      alert('Please select check-in date first');
      return;
    }
    if (hasBookedDateInBetween(bookingData.checkinDate, candidateCheckout)) {
      alert('Some dates are already booked');
      return;
    }
    if (!isCheckoutDateAllowed(bookingData.checkinDate, candidateCheckout)) {
      alert('Check-out date must be after check-in date');
      return;
    }
    setBookingData({ ...bookingData, checkoutDate: candidateCheckout });
  };
  const updateBookingDays = (days: number) => {
    if (!bookingData.checkinDate) {
      alert('Please select check-in date first');
      return;
    }
    const candidateCheckout = resolveCheckoutForDays(bookingData.checkinDate, days);
    if (!candidateCheckout) {
      alert('Selected day-wise range is not available');
      return;
    }
    setBookingData({ ...bookingData, checkoutDate: candidateCheckout });
  };

  const handleCalendarDateClick = (dateKey: string) => {
    if (!availableDatesSet.has(dateKey)) return;
    if (bookingData.checkinDate === dateKey || bookingData.checkoutDate === dateKey) {
      setBookingData({ ...bookingData, checkinDate: '', checkoutDate: '' });
      return;
    }
    if (!bookingData.checkinDate) {
      updateCheckinDate(dateKey);
      return;
    }

    if (!isCheckoutDateAllowed(bookingData.checkinDate, dateKey)) {
      if (isDateBooked(dateKey)) {
        alert('Selected check-in date is already booked');
        return;
      }
      updateCheckinDate(dateKey);
      return;
    }

    updateCheckoutDate(dateKey);
  };

  const selectedStayDays = getStayDays(bookingData.checkinDate, bookingData.checkoutDate);
  const bookingDayOptions = Array.from({ length: 15 }, (_, index) => index + 1);

  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const cells: React.ReactNode[] = [];

    for (let i = 0; i < startWeekDay; i++) {
      cells.push(<div key={`blank-${i}`} />);
    }

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const dateKey = getDateKey(date);
      const isBooked = isDateBooked(dateKey);
      const isCheckinSelected = bookingData.checkinDate === dateKey;
      const isCheckoutSelected = bookingData.checkoutDate === dateKey;
      const isSelected = isCheckinSelected || isCheckoutSelected;
      const isWithinRange =
        !!bookingData.checkinDate &&
        !!bookingData.checkoutDate &&
        dateKey > bookingData.checkinDate &&
        dateKey < bookingData.checkoutDate;
      const isSelectableFromCalendar = availableDatesSet.has(dateKey);
      const dayBackground = isBooked
        ? '#fee2e2'
        : isCheckinSelected
          ? '#2563eb'
          : isCheckoutSelected
            ? '#eaf2ff'
            : isWithinRange
              ? '#1d4ed8'
              : '#f8fafc';
      const dayTextColor = isBooked ? '#991b1b' : isCheckinSelected || isWithinRange ? '#ffffff' : '#1f2937';
      const daySubTextColor = isBooked ? '#b91c1c' : isCheckinSelected || isWithinRange ? '#dbeafe' : '#0f766e';
      const daySubText = isBooked ? 'Booked' : isCheckinSelected ? 'Check-in' : isCheckoutSelected ? 'Check-out' : isWithinRange ? 'Selected' : 'Available';

      cells.push(
        <div
          key={dateKey}
          className={`calendar-day-card booking-day-card ${isBooked ? 'is-booked' : 'is-available'}`}
          onClick={() => handleCalendarDateClick(dateKey)}
          style={{
            minHeight: '74px',
            border: isSelected ? '2px solid #2563eb' : '1px solid #d1d5db',
            borderRadius: '12px',
            padding: '6px 7px',
            background: dayBackground,
            boxSizing: 'border-box',
            cursor: isSelectableFromCalendar ? 'pointer' : 'not-allowed',
            opacity: isSelectableFromCalendar ? 1 : 0.45
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.72rem', marginBottom: '3px', color: dayTextColor }}>{day}</div>
          <div className="calendar-day-sub" style={{ fontSize: '0.6rem', color: daySubTextColor, lineHeight: 1.2 }}>
            {daySubText}
          </div>
        </div>
      );
    }

    return cells;
  };

  return (
    <div className="page-center travel-page booking-page" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="surface-card booking-shell" style={{
        background: 'rgba(255, 255, 255, 0.96)',
        borderRadius: '22px',
        padding: '18px 14px',
        maxWidth: '760px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.09)',
        border: '1px solid #dbe2ec'
      }}>
        <div className="card-topbar booking-navbar" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <button
            onClick={onBack}
            className="compact-back-btn booking-navbar-back-btn"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#1f2937',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              justifySelf: 'start'
            }}
          >
            <span aria-hidden="true" style={{ color: '#2f6b4f', fontSize: '1.3rem', lineHeight: 1 }}>&#8592;</span>
            <span>Back</span>
          </button>
          <div className="booking-navbar-title" style={{ textAlign: 'center', fontWeight: 700, color: '#111827', fontSize: '1.8rem' }}>
            Booking Schedule
          </div>
          <div aria-hidden="true" style={{ width: '42px', justifySelf: 'end' }} />
        </div>

        <p style={{ textAlign: 'center', color: '#4b5563', margin: '0 0 14px 0', fontSize: '1.1rem' }}>
          Please select your preferred check-in and check-out dates.
        </p>

        <div
          className="timing-chip"
          style={{
            marginBottom: '18px',
            padding: '14px 14px 12px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #eaf0ff 0%, #edf1fb 100%)',
            border: '1px solid #bfd0f6',
            color: '#1e3a5f'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '8px', fontSize: '1.05rem' }}>
            Booking Timings
          </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                <span><strong>Check-in:</strong> 7:30 AM</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                <span><strong>Check-out Time:</strong> 6:30 AM (on selected check-out date)</span>
              </div>
            </div>
          </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#111827', fontWeight: 500, fontSize: '1.12rem' }}>
              Check-in Date
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#255f4a' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M16 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#111827', pointerEvents: 'none' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <select
                value={bookingData.checkinDate}
                onChange={(e) => updateCheckinDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '13px 42px 13px 46px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '13px',
                  fontSize: '1.08rem',
                  boxSizing: 'border-box',
                  background: '#f8fafc',
                  color: '#1f2937',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none'
                }}
                required
              >
                <option value="">Choose your check-in date</option>
                {availableDates.map(date => {
                  const isBookedOption = isDateBooked(date);
                  return (
                  <option key={date} value={date} disabled={isBookedOption}>
                    {new Date(date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}{isBookedOption ? ' (Already Booked)' : ''}
                  </option>
                )})}
              </select>
            </div>
            {bookingData.checkinDate && isDateBooked(bookingData.checkinDate) && (
              <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '5px' }}>
                This date is already booked.
              </div>
            )}
            {bookingAvailabilityError && (
              <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '5px' }}>
                {bookingAvailabilityError}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#111827', fontWeight: 500, fontSize: '1.12rem' }}>
              Booking Duration
            </label>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#0f766e', fontWeight: 700 }}>
                D
              </span>
              <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#111827', pointerEvents: 'none' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <select
                value={Math.max(selectedStayDays, 1)}
                onChange={(e) => updateBookingDays(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '13px 42px 13px 46px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '13px',
                  fontSize: '1.08rem',
                  boxSizing: 'border-box',
                  background: '#f8fafc',
                  color: '#1f2937',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none'
                }}
              >
                {bookingDayOptions.map((dayCount) => {
                  const candidateCheckout = bookingData.checkinDate ? getDateAfterDaysKey(bookingData.checkinDate, dayCount) : '';
                  const blockedInBetween = bookingData.checkinDate ? hasBookedDateInBetween(bookingData.checkinDate, candidateCheckout) : false;
                  const isDisabled = !bookingData.checkinDate || !availableDatesSet.has(candidateCheckout) || blockedInBetween;
                  return (
                    <option key={dayCount} value={dayCount} disabled={isDisabled}>
                      {dayCount} Day{dayCount > 1 ? 's' : ''}{isDisabled ? ' (Unavailable)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <label style={{ display: 'block', marginBottom: '8px', color: '#111827', fontWeight: 500, fontSize: '1.12rem' }}>
              Check-out Date
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#1e6f9f' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M16 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#111827', pointerEvents: 'none' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <select
                value={bookingData.checkoutDate}
                onChange={(e) => updateCheckoutDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '13px 42px 13px 46px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '13px',
                  fontSize: '1.08rem',
                  boxSizing: 'border-box',
                  background: '#f8fafc',
                  color: '#1f2937',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none'
                }}
                required
              >
                <option value="">Choose your check-out date</option>
                {availableDates.map(date => {
                  const isBookedOption = isDateBooked(date);
                  const hasBookedInBetween = bookingData.checkinDate
                    ? hasBookedDateInBetween(bookingData.checkinDate, date)
                    : false;
                  const isDisabled = !bookingData.checkinDate || !isCheckoutDateAllowed(bookingData.checkinDate, date) || hasBookedInBetween;
                  return (
                    <option key={date} value={date} disabled={isDisabled}>
                      {new Date(date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}{hasBookedInBetween ? ' (Already Booked)' : isBookedOption ? ' (Already Booked)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            {bookingData.checkinDate && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '5px' }}>
                Only dates after {new Date(bookingData.checkinDate).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric'
                })} are available for check-out. Day-wise booking is enabled and check-out is valid till 6:30 AM on the selected check-out date.
              </div>
            )}
          </div>

          <div className="calendar-panel" style={{
            background: '#fdfefe',
            border: '1px solid #d1d5db',
            borderRadius: '18px',
            padding: '14px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                style={{
                  border: '1px solid #c8ced7',
                  background: '#f1f5f9',
                  borderRadius: '12px',
                  padding: '6px 14px',
                  cursor: 'pointer'
                }}
              >
                Prev
              </button>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.12rem' }}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                style={{
                  border: '1px solid #c8ced7',
                  background: '#f1f5f9',
                  borderRadius: '12px',
                  padding: '6px 14px',
                  cursor: 'pointer'
                }}
              >
                Next
              </button>
            </div>

            <div className="calendar-weekdays-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: '6px',
              marginBottom: '6px',
              fontSize: '0.72rem',
              color: '#334155',
              fontWeight: 600
            }}>
              <div style={{ textAlign: 'center' }}>Sun</div>
              <div style={{ textAlign: 'center' }}>Mon</div>
              <div style={{ textAlign: 'center' }}>Tue</div>
              <div style={{ textAlign: 'center' }}>Wed</div>
              <div style={{ textAlign: 'center' }}>Thu</div>
              <div style={{ textAlign: 'center' }}>Fri</div>
              <div style={{ textAlign: 'center' }}>Sat</div>
            </div>

            <div className="calendar-days-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: '6px'
            }}>
              {renderCalendar()}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '10px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#0f172a' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: '#2f855a', display: 'inline-block' }} />
                <strong>Available</strong>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#0f172a' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: '#dc2626', display: 'inline-block' }} />
                Booked
              </span>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#4b5563', marginTop: '8px' }}>
              Dates marked in red indicate confirmed bookings and are unavailable.
            </div>

            <div style={{ marginTop: '12px', border: '1px solid #dbe2eb', borderRadius: '14px', background: '#f8fafc', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#0f172a', fontWeight: 700, fontSize: '1.1rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="#3a8f56" strokeWidth="2" />
                  <path d="M3 10H21" stroke="#3a8f56" strokeWidth="2" />
                  <path d="M8 3V7" stroke="#3a8f56" strokeWidth="2" strokeLinecap="round" />
                  <path d="M16 3V7" stroke="#3a8f56" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Your Booking
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ borderRight: '1px solid #d5dde8', paddingRight: '8px' }}>
                  <div style={{ marginBottom: '6px', color: '#1f2937', fontSize: '0.88rem' }}>
                    <strong>Check-in:</strong> {bookingData.checkinDate ? new Date(bookingData.checkinDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                  </div>
                  <div style={{ color: '#1f2937', fontSize: '0.88rem' }}>
                    <strong>Total Days:</strong> {selectedStayDays || 0}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#1f2937', fontSize: '0.88rem' }}>
                    <strong>Check-out:</strong> {bookingData.checkoutDate ? new Date(bookingData.checkoutDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            className="primary-cta success-cta"
            type="submit"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #2f855a 0%, #34d399 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              padding: '16px',
              fontSize: '1.15rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 8px 18px rgba(34, 139, 97, 0.25)'
            }}
          >
            Review Payment Details
          </button>
        </form>
      </div>
    </div>
  );
};

const PaymentSummaryPage: React.FC<{
  bookingData: BookingData;
  setBookingData: (data: BookingData) => void;
  onNext: () => void;
  onBack: () => void;
}> = ({ bookingData, setBookingData, onNext, onBack }) => {
  const calculateMinAdvance = (totalAmount: number, days: number) => {
    if (days <= 1) return 1000;
    return Math.ceil(totalAmount * 0.3);
  };
  const customMinAmount = 1000;

  const stayDays = bookingData.checkinDate && bookingData.checkoutDate
    ? Math.max(Math.ceil(Math.abs(new Date(bookingData.checkoutDate).getTime() - new Date(bookingData.checkinDate).getTime()) / (1000 * 60 * 60 * 24)), 1)
    : 1;
  const minAdvance = calculateMinAdvance(bookingData.totalAmount, stayDays);
  const isCustomBelowMinimum = bookingData.paymentType === 'custom' && bookingData.paymentAmount < customMinAmount;
  const securityDepositAmount = bookingData.includeSecurityDeposit ? 500 : 0;
  const payableNowAmount = bookingData.paymentAmount + securityDepositAmount;
  const remainingBookingAmount = Math.max(bookingData.totalAmount - bookingData.paymentAmount, 0);

  return (
    <div className="page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="surface-card" style={{ background: 'rgba(255, 255, 255, 0.96)', borderRadius: '22px', padding: '18px 14px', maxWidth: '760px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.09)', border: '1px solid #dbe2ec' }}>
        <div className="card-topbar booking-navbar" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <button
            onClick={onBack}
            className="compact-back-btn booking-navbar-back-btn"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#1f2937',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              justifySelf: 'start'
            }}
          >
            <span aria-hidden="true" style={{ color: '#2f6b4f', fontSize: '1.3rem', lineHeight: 1 }}>&#8592;</span>
            <span>Back</span>
          </button>
          <div className="booking-navbar-title" style={{ textAlign: 'center', fontWeight: 700, color: '#111827', fontSize: '1.8rem' }}>
            Payment Summary
          </div>
          <div aria-hidden="true" style={{ width: '42px', justifySelf: 'end' }} />
        </div>

        <p style={{ textAlign: 'center', color: '#4b5563', margin: '0 0 14px 0', fontSize: '1.1rem' }}>
          Review your booking payment details before proceeding.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isCustomBelowMinimum) {
              alert(`Minimum custom amount is Rs ${customMinAmount}`);
              return;
            }
            onNext();
          }}
        >
          <div style={{ background: '#fdfefe', border: '1px solid #d1d5db', borderRadius: '18px', overflow: 'hidden', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '1.12rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="#2f6b4f" strokeWidth="2" />
                  <path d="M3 10H21" stroke="#2f6b4f" strokeWidth="2" />
                  <path d="M8 3V7" stroke="#2f6b4f" strokeWidth="2" strokeLinecap="round" />
                  <path d="M16 3V7" stroke="#2f6b4f" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Booking Details
              </div>
              <div style={{ color: '#14532d', fontWeight: 700, fontSize: '2rem' }}>Rs {bookingData.totalAmount}</div>
            </div>

            <div style={{ padding: '14px' }}>
              <div style={{ color: '#111827', fontWeight: 500, fontSize: '1.12rem', marginBottom: '10px' }}>Total Booking Amount</div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', padding: '12px', border: bookingData.paymentType === 'advance' ? '2px solid #2f855a' : '1px solid #d1d5db', borderRadius: '12px', background: '#f9fafb' }}>
                  <input
                    type="radio"
                    name="paymentType"
                    value="advance"
                    checked={bookingData.paymentType === 'advance'}
                    onChange={() => setBookingData({ ...bookingData, paymentType: 'advance', paymentAmount: minAdvance })}
                    style={{ display: 'none' }}
                  />
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', border: bookingData.paymentType === 'advance' ? 'none' : '2px solid #6b7280', background: bookingData.paymentType === 'advance' ? '#2f855a' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                    {bookingData.paymentType === 'advance' ? '\u2713' : ''}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '1.02rem' }}>Advance Payment - Rs {minAdvance}</div>
                    <div style={{ fontSize: '0.88rem', color: '#6b7280', marginTop: '3px' }}>
                      Minimum Rs {customMinAmount} required. Remaining balance can be paid at check-in.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', padding: '12px', border: bookingData.paymentType === 'full' ? '2px solid #2f855a' : '1px solid #d1d5db', borderRadius: '12px', background: '#f9fafb' }}>
                  <input
                    type="radio"
                    name="paymentType"
                    value="full"
                    checked={bookingData.paymentType === 'full'}
                    onChange={() => setBookingData({ ...bookingData, paymentType: 'full', paymentAmount: bookingData.totalAmount })}
                    style={{ display: 'none' }}
                  />
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', border: bookingData.paymentType === 'full' ? 'none' : '2px solid #6b7280', background: bookingData.paymentType === 'full' ? '#2f855a' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                    {bookingData.paymentType === 'full' ? '\u2713' : ''}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '1.02rem' }}>Full Payment - Rs {bookingData.totalAmount}</div>
                    <div style={{ fontSize: '0.88rem', color: '#6b7280', marginTop: '3px' }}>
                      Pay the full booking amount now.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', padding: '12px', border: bookingData.paymentType === 'custom' ? '2px solid #2f855a' : '1px solid #d1d5db', borderRadius: '12px', background: '#f9fafb' }}>
                  <input
                    type="radio"
                    name="paymentType"
                    value="custom"
                    checked={bookingData.paymentType === 'custom'}
                    onChange={() => {
                      const normalizedCustomAmount = Math.min(Number(bookingData.customAmount) || 0, bookingData.totalAmount);
                      setBookingData({
                        ...bookingData,
                        paymentType: 'custom',
                        customAmount: normalizedCustomAmount,
                        paymentAmount: normalizedCustomAmount
                      });
                    }}
                    style={{ display: 'none' }}
                  />
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', border: bookingData.paymentType === 'custom' ? 'none' : '2px solid #6b7280', background: bookingData.paymentType === 'custom' ? '#2f855a' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                    {bookingData.paymentType === 'custom' ? '\u2713' : ''}
                  </span>
                  <div style={{ width: '100%' }}>
                    <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '1.02rem' }}>Custom Payment Amount</div>
                    <div style={{ fontSize: '0.88rem', color: '#6b7280', marginTop: '3px' }}>
                      Enter amount (Minimum Rs {customMinAmount})
                    </div>
                    {bookingData.paymentType === 'custom' && (
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={bookingData.customAmount}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          const numericValue = parseInt(value, 10) || 0;
                          const amount = Math.min(numericValue, bookingData.totalAmount);
                          setBookingData({
                            ...bookingData,
                            customAmount: amount,
                            paymentAmount: amount
                          });
                        }}
                        placeholder="Enter custom amount"
                        style={{ marginTop: '8px', width: '170px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                </label>
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '14px', paddingTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#1f2937', fontWeight: 500, fontSize: '1.02rem' }}>
                  <input
                    type="checkbox"
                    checked={bookingData.includeSecurityDeposit}
                    onChange={(e) => setBookingData({ ...bookingData, includeSecurityDeposit: e.target.checked })}
                    style={{ display: 'none' }}
                  />
                  <span style={{ width: '24px', height: '24px', borderRadius: '7px', background: bookingData.includeSecurityDeposit ? '#2f855a' : '#e5e7eb', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {bookingData.includeSecurityDeposit ? '\u2713' : ''}
                  </span>
                  Include Refundable Security Deposit (Rs500)
                </label>
                <p style={{ margin: '8px 0 0 34px', color: '#6b7280', fontSize: '0.9rem' }}>
                  This deposit will be refunded after checkout.
                </p>
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '14px', paddingTop: '12px' }}>
                <div style={{ color: '#111827', fontWeight: 700, fontSize: '1.04rem', marginBottom: '8px' }}>Bill Summary</div>
                <div style={{ display: 'grid', gap: '6px', color: '#4b5563', fontSize: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Booking Amount</span>
                    <span style={{ color: '#14532d', fontWeight: 700 }}>Rs {bookingData.paymentAmount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Security Deposit</span>
                    <span style={{ color: '#14532d', fontWeight: 700 }}>Rs {securityDepositAmount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Processing Fee</span>
                    <span style={{ color: '#14532d', fontWeight: 700 }}>Rs 0</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: '#111827', fontWeight: 700, fontSize: '1.1rem' }}>Grand Total</div>
                  <div style={{ color: '#166534', fontWeight: 700, fontSize: '2rem' }}>Rs {payableNowAmount}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginBottom: '12px' }}>
            <span style={{ color: '#4b5563', fontSize: '1.05rem' }}>Amount Payable Now</span>
            <span style={{ color: '#166534', fontWeight: 700, fontSize: '2rem' }}>Rs {payableNowAmount}</span>
          </div>

          <div style={{ background: '#fff8eb', border: '1px solid #eadfcb', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ color: '#7c5a1f', fontWeight: 700, fontSize: '1.25rem', marginBottom: '6px' }}>! Important Information</div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: '#4b5563', fontSize: '0.98rem', lineHeight: 1.35 }}>
              <li>Any remaining balance must be cleared before check-in.</li>
              <li>A refundable Rs 500 electricity security deposit will be collected during check-in.</li>
              <li>The electricity deposit will be refunded at check-out after adjusting actual usage.</li>
            </ul>
          </div>

          {(bookingData.paymentType === 'advance' || bookingData.paymentType === 'custom') && bookingData.paymentAmount < bookingData.totalAmount && (
            <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0 0 10px 0' }}>
              Remaining booking amount Rs {remainingBookingAmount} to be paid at check-in.
            </p>
          )}
          {isCustomBelowMinimum && (
            <p style={{ color: '#dc2626', fontSize: '0.88rem', margin: '0 0 10px 0', fontWeight: 600 }}>
              Custom amount must be at least Rs {customMinAmount} to proceed.
            </p>
          )}

          <button
            className="primary-cta success-cta"
            type="submit"
            disabled={isCustomBelowMinimum}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #2f855a 0%, #34d399 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              padding: '16px',
              fontSize: '1.15rem',
              fontWeight: 700,
              cursor: isCustomBelowMinimum ? 'not-allowed' : 'pointer',
              opacity: isCustomBelowMinimum ? 0.65 : 1,
              boxShadow: '0 8px 18px rgba(34, 139, 97, 0.25)'
            }}
          >
            Confirm & Proceed to Payment
          </button>
        </form>
      </div>
    </div>
  );
};

// Payment Page
const PaymentPage: React.FC<{
  amount: number;
  paymentProof: string | null;
  onPaymentProofChange: (proof: string | null) => void;
  onSuccess: () => Promise<void> | void;
  onBack: () => void;
}> = ({ amount, paymentProof, onPaymentProofChange, onSuccess, onBack }) => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [copyText, setCopyText] = useState<'Copy' | 'Copied'>('Copy');
  const [proofFileName, setProofFileName] = useState(paymentProof ? 'Uploaded Payment Proof' : '');

  const upiId = process.env.REACT_APP_UPI_ID || '8709276546@ptsbi';
  const payeeName = process.env.REACT_APP_UPI_NAME || 'Jharkhand Chhatriya Sangh Bhawan';
  const transactionNote = 'Booking Payment';
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`;

  const completeManualPayment = async () => {
    setProcessing(true);
    setError('');
    try {
      await Promise.resolve(onSuccess());
    } catch (err: any) {
      setError(err?.message || 'Payment marked but booking save failed');
    } finally {
      setProcessing(false);
    }
  };

  const copyUpiId = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(upiId);
      } else {
        const tempInput = document.createElement('input');
        tempInput.value = upiId;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      setCopyText('Copied');
      window.setTimeout(() => setCopyText('Copy'), 1200);
    } catch {
      setError('Unable to copy UPI ID. Please copy it manually.');
    }
  };

  const handleUploadProof = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setProofFileName('');
      onPaymentProofChange(null);
      setError('');
      return;
    }
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      setError('Please upload JPG, PNG, or PDF file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Payment proof should be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const proofData = String(e.target?.result || '');
      if (!proofData) {
        setError('Unable to read payment proof file');
        return;
      }
      onPaymentProofChange(proofData);
      setProofFileName(file.name);
      setError('');
    };
    reader.onerror = () => {
      setError('Unable to read payment proof file');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="page-center" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="surface-card" style={{
        background: 'rgba(255, 255, 255, 0.96)',
        borderRadius: '22px',
        padding: '18px 14px',
        maxWidth: '760px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.09)',
        border: '1px solid #dbe2ec'
      }}>
        <div className="card-topbar booking-navbar" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <button
            onClick={onBack}
            className="compact-back-btn booking-navbar-back-btn"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#1f2937',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              justifySelf: 'start'
            }}
          >
            <span aria-hidden="true" style={{ color: '#2f6b4f', fontSize: '1.3rem', lineHeight: 1 }}>&#8592;</span>
            <span>Back</span>
          </button>
          <div className="booking-navbar-title" style={{ textAlign: 'center', fontWeight: 700, color: '#111827', fontSize: '1.8rem' }}>
            Payment Options
          </div>
          <div aria-hidden="true" style={{ width: '42px', justifySelf: 'end' }} />
        </div>

        <p style={{ textAlign: 'center', color: '#4b5563', margin: '0 0 14px 0', fontSize: '1.1rem' }}>
          Choose a payment method to complete your booking.
        </p>

        <div style={{ background: 'linear-gradient(135deg, #edf3f4 0%, #f7f9fb 100%)', border: '1px solid #d8e1e7', borderRadius: '14px', padding: '14px', marginBottom: '14px', textAlign: 'center' }}>
          <div style={{ color: '#1f2937', fontWeight: 500, fontSize: '1.1rem', marginBottom: '6px' }}>Total Amount Payable</div>
          <div style={{ color: '#146b54', fontWeight: 700, fontSize: '3rem', lineHeight: 1 }}>Rs {amount}</div>
        </div>

        {error && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '10px 12px',
            borderRadius: '10px',
            marginBottom: '14px',
            fontSize: '0.92rem'
          }}>
            {error}
          </div>
        )}

        <div style={{ color: '#111827', fontWeight: 500, fontSize: '1.12rem', marginBottom: '10px' }}>Select Payment Method</div>

        <div style={{ border: '1px solid #d1d5db', borderRadius: '14px', overflow: 'hidden', background: '#fdfefe', marginBottom: '12px' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '28px', height: '28px', borderRadius: '999px', background: '#2f855a', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {'\u2713'}
            </span>
            <div>
              <div style={{ color: '#1f2937', fontWeight: 700, fontSize: '1.08rem' }}>UPI Payment (Scan QR Code)</div>
              <div style={{ color: '#64748b', marginTop: '3px', fontSize: '0.95rem' }}>Supported Apps: <strong>BHIM</strong>, Google Pay, Paytm, PhonePe</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '12px' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ border: '1px solid #d1d5db', borderRadius: '12px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ background: '#f8fafc', padding: '10px 12px', color: '#334155', fontWeight: 500, borderBottom: '1px solid #e5e7eb' }}>UPI ID</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px' }}>
                  <span style={{ color: '#334155', fontSize: '1.04rem', fontWeight: 600, wordBreak: 'break-all' }}>{upiId}</span>
                  <button
                    type="button"
                    onClick={copyUpiId}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', color: '#334155', padding: '6px 10px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {copyText}
                  </button>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>You can send payment directly using this UPI ID.</div>
              <a
                href={upiLink}
                target="_blank"
                rel="noreferrer"
                style={{ marginTop: '8px', display: 'inline-block', color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}
              >
                Open UPI App
              </a>
            </div>

            <div style={{ flex: '0 0 230px', border: '1px solid #d1d5db', borderRadius: '12px', padding: '10px', textAlign: 'center', margin: '0 auto', background: '#ffffff' }}>
              <img
                src={qrCodeUrl}
                alt="UPI QR Code"
                style={{ width: '100%', maxWidth: '200px', height: '200px', objectFit: 'contain', marginBottom: '6px' }}
              />
              <div style={{ color: '#334155', fontWeight: 600, letterSpacing: '0.03em' }}>SCAN & PAY</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#111827', fontWeight: 500, fontSize: '1.12rem', marginBottom: '8px' }}>How to Pay</div>
          <div style={{ border: '1px solid #d1d5db', borderRadius: '14px', background: '#fdfefe', padding: '12px' }}>
            <div style={{ display: 'grid', gap: '8px', color: '#334155', fontSize: '1.08rem' }}>
              {['Open your UPI app', 'Scan QR or enter UPI ID', 'Complete payment', 'Confirm payment below'].map((step, index) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '28px', height: '28px', borderRadius: '999px', background: '#2f855a', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{index + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '10px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', textAlign: 'center', color: '#334155', fontWeight: 700 }}>
              G Pay | Paytm | BHIM | PhonePe
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <div style={{ color: '#111827', fontWeight: 500, fontSize: '1.12rem', marginBottom: '8px' }}>Upload Payment Screenshot (Optional)</div>
          <label style={{ display: 'block', border: '2px dashed #bfdbfe', borderRadius: '12px', padding: '18px', textAlign: 'center', color: '#64748b', cursor: 'pointer', background: '#f8fafc' }}>
            <input type="file" accept="image/*,.pdf" onChange={handleUploadProof} style={{ display: 'none' }} />
            <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>Drop image here or Click to upload file</div>
            <div style={{ fontSize: '0.92rem' }}>Any image or PDF | Max 10MB</div>
            {proofFileName && (
              <div style={{ marginTop: '8px', color: '#0f766e', fontWeight: 600 }}>Selected: {proofFileName}</div>
            )}
            {paymentProof && paymentProof.startsWith('data:image') && (
              <div style={{ marginTop: '10px' }}>
                <img
                  src={paymentProof}
                  alt="Uploaded payment proof"
                  style={{ width: '100%', maxWidth: '220px', maxHeight: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>
            )}
          </label>
        </div>

        <div style={{ color: '#1d4ed8', marginBottom: '10px', fontWeight: 600, fontSize: '0.9rem' }}>Razorpay available soon</div>

        <button
          onClick={completeManualPayment}
          disabled={processing}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #2f855a 0%, #34d399 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '16px',
            padding: '16px',
            fontSize: '1.15rem',
            fontWeight: 700,
            cursor: processing ? 'not-allowed' : 'pointer',
            opacity: processing ? 0.7 : 1,
            boxShadow: '0 8px 18px rgba(34, 139, 97, 0.25)'
          }}
        >
          {processing ? 'Confirming...' : 'Confirm Payment'}
        </button>
      </div>
    </div>
  );
};

const PaymentApprovalWaitingPage: React.FC<{
  bookingCode?: string;
  status: PaymentApprovalState | null;
  onRefresh: () => void;
  onBackToPayment: () => void;
}> = ({ bookingCode, status, onRefresh, onBackToPayment }) => {
  const approved = Boolean(status?.adminApproved);
  const rejected = Boolean(status?.adminRejected);
  const pending = !approved && !rejected;
  const canCallAdmin = ADMIN_CONTACT_PHONE.length >= 10;
  const adminCallLink = `tel:+91${ADMIN_CONTACT_PHONE}`;
  const [contactCountdown, setContactCountdown] = useState(CONTACT_REVEAL_DELAY_SECONDS);
  const showContactHelp = pending && contactCountdown <= 0;
  const countdownMinutes = String(Math.floor(contactCountdown / 60)).padStart(2, '0');
  const countdownSeconds = String(contactCountdown % 60).padStart(2, '0');
  const statusLabel = approved ? 'Payment Approved' : rejected ? 'Payment Rejected' : 'Awaiting Admin Approval';
  const statusColor = approved ? '#13795b' : rejected ? '#b42318' : '#b57d13';
  const progressPercent = approved || rejected ? 100 : 50;

  React.useEffect(() => {
    if (!pending) {
      setContactCountdown(CONTACT_REVEAL_DELAY_SECONDS);
      return;
    }
    const timer = window.setInterval(() => {
      setContactCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  return (
    <div
      className="page-center"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '36px 18px',
        background: '#f4f5fb'
      }}
    >
      <div style={{ width: '100%', maxWidth: '1060px', color: '#1f2f46' }}>
        <h1 style={{ margin: '0 0 10px 0', textAlign: 'center', fontSize: 'clamp(1.85rem, 4.2vw, 3.2rem)', color: '#102243', fontWeight: 800 }}>
          Payment Verification in Progress
        </h1>
        <p style={{ margin: '0 0 24px 0', textAlign: 'center', fontSize: 'clamp(1.1rem, 2vw, 1.8rem)', color: '#31435b' }}>
          {bookingCode ? `Your payment for Allotment No. ${bookingCode} is currently under admin verification.` : 'Your payment is currently under admin verification.'}
        </p>

        <div
          style={{
            background: '#f9fafc',
            border: '1px solid #d6dce6',
            borderRadius: '24px',
            padding: '24px 24px 20px 24px',
            boxShadow: '0 10px 25px rgba(17, 24, 39, 0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 14px', marginBottom: '16px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: '#1e293b', fontSize: 'clamp(0.95rem, 1.5vw, 1.18rem)', fontWeight: 600 }}>
              <span style={{ width: '28px', height: '28px', borderRadius: '999px', background: '#3f9f87', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>✓</span>
              Booking Details
            </div>
            <span style={{ color: '#9ba9bc', fontWeight: 700, fontSize: '1.1rem' }}>&#8250;</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: '#1e293b', fontSize: 'clamp(0.95rem, 1.5vw, 1.18rem)', fontWeight: 600 }}>
              <span style={{ width: '28px', height: '28px', borderRadius: '999px', background: '#3f9f87', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>✓</span>
              Payment Submitted
            </div>
            <span style={{ color: '#9ba9bc', fontWeight: 700, fontSize: '1.1rem' }}>&#8250;</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: statusColor, fontSize: 'clamp(0.95rem, 1.5vw, 1.18rem)', fontWeight: 700 }}>
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '999px',
                  border: `2px solid ${statusColor}`,
                  color: statusColor,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  background: '#fff'
                }}
              >
                {approved ? '✓' : rejected ? '!' : '\u23F3'}
              </span>
              {approved ? 'Approved' : rejected ? 'Rejected' : 'Verification In Progress'}
            </div>
          </div>
          <div style={{ position: 'relative', height: '10px', borderRadius: '999px', background: '#e4e7ee' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPercent}%`, borderRadius: '999px', background: 'linear-gradient(90deg, #3f9f87 0%, #4ab091 100%)' }} />
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                left: `calc(${progressPercent}% - 11px)`,
                width: '22px',
                height: '22px',
                borderRadius: '999px',
                border: '4px solid #3f9f87',
                background: '#d5f0e7'
              }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: '24px',
            background: '#f9fafc',
            border: '1px solid #d6dce6',
            borderRadius: '30px',
            padding: '30px',
            boxShadow: '0 24px 40px rgba(17, 24, 39, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
            <span
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '999px',
                border: '5px dotted #66b89d',
                borderTopStyle: 'solid',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4ca58d',
                fontSize: '1.1rem',
                fontWeight: 700
              }}
            >
              {approved ? '✓' : rejected ? '!' : ''}
            </span>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.4rem, 3.4vw, 3rem)', color: '#102243' }}>Verification Status</h2>
          </div>

          <div
            style={{
              borderRadius: '20px',
              border: '1px solid #d6dce6',
              background: '#fefbf4',
              padding: '20px 22px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: statusColor, fontSize: 'clamp(1.15rem, 2.4vw, 2.05rem)', fontWeight: 800 }}>
              <span
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '999px',
                  background: statusColor,
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  fontWeight: 800
                }}
              >
                {approved ? '\u2713' : rejected ? '!' : '!'}
              </span>
              {statusLabel}
            </div>
            {pending && (
              <div style={{ marginTop: '14px', color: '#2f4059', fontSize: 'clamp(1.08rem, 2.1vw, 1.8rem)' }}>
                Estimated Time Remaining: <strong style={{ color: '#0f2947' }}>{countdownMinutes}:{countdownSeconds}</strong>
              </div>
            )}
            {rejected && (
              <div style={{ marginTop: '10px', color: '#7f1d1d', fontSize: '1rem' }}>
                {status?.rejectionReason || 'Payment was not approved by admin.'}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #e0e4eb', marginTop: '20px', paddingTop: '18px', color: '#2f4059', fontSize: 'clamp(1.02rem, 2vw, 1.7rem)', lineHeight: 1.55 }}>
            <div>Please wait while our admin verifies your payment.</div>
            <div>This usually takes less than a minute.</div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <button
              onClick={onRefresh}
              style={{
                border: '1px solid #2c8b75',
                borderRadius: '18px',
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #2f8f7a 0%, #3fa68f 100%)',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 'clamp(1rem, 1.8vw, 1.85rem)',
                boxShadow: '0 10px 22px rgba(47, 143, 122, 0.35)'
              }}
            >
              Refresh Verification
            </button>
            {(rejected || pending) && (
              <button
                onClick={onBackToPayment}
                style={{
                  border: '1px solid #d4dbe6',
                  borderRadius: '18px',
                  padding: '14px 28px',
                  background: '#f6f8fc',
                  color: '#5f6f85',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 'clamp(1rem, 1.8vw, 1.85rem)'
                }}
              >
                Back to Payment Options
              </button>
            )}
            {showContactHelp && canCallAdmin && (
              <a href={adminCallLink} style={{ textDecoration: 'none' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '18px',
                    padding: '14px 20px',
                    background: '#0f766e',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 'clamp(1rem, 1.6vw, 1.3rem)'
                  }}
                >
                  Call Admin
                </span>
              </a>
            )}
          </div>
        </div>

        <div style={{ marginTop: '20px', borderTop: '1px solid #d8dee8', paddingTop: '18px', color: '#2f4059', fontSize: 'clamp(1.02rem, 2vw, 1.7rem)', lineHeight: 1.55 }}>
          <div>Please wait while our admin verifies your payment.</div>
          <div>This usually takes less than a minute.</div>
        </div>
      </div>
    </div>
  );
};

const BookingDetailsLookupPage: React.FC<{
  onBack: () => void;
  onPayNow: (bookingCode: string, mobile: string) => Promise<void>;
}> = ({ onBack, onPayNow }) => {
  const [bookingCode, setBookingCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [error, setError] = useState('');
  const [record, setRecord] = useState<BookingRecord | null>(null);

  const getPurposeLabel = (row: BookingRecord) => {
    if (row.bookingPurpose === 'other') return row.bookingPurposeOther || 'Other';
    return row.bookingPurpose || 'Stay';
  };

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanCode = bookingCode.replace(/\D/g, '').slice(0, 4);
    const cleanMobile = mobile.replace(/\D/g, '').slice(0, 10);
    if (cleanCode.length < 4) {
      setError('Please enter your 4-digit Allotment No.');
      setRecord(null);
      return;
    }
    if (cleanMobile.length !== 10) {
      setError('Please enter your 10-digit mobile number.');
      setRecord(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/bookings');
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Unable to verify booking details');
      }

      const matched = (result?.bookings || []).find((item: any) => {
        const code = String(item?.bookingCode || '').replace(/\D/g, '').slice(0, 4);
        const digits = String(item?.mobile || '').replace(/\D/g, '').slice(-10);
        return code === cleanCode && digits === cleanMobile;
      });

      if (!matched) {
        setRecord(null);
        setError('No booking found for this Allotment No. and mobile number.');
        return;
      }

      setRecord(matched as BookingRecord);
    } catch (err: any) {
      setRecord(null);
      setError(err?.message || 'Unable to fetch booking details right now');
    } finally {
      setLoading(false);
    }
  };

  const finalAmount = Number(record?.finalAmount ?? record?.totalAmount ?? 0);
  const paidAmount = Number(record?.paymentAmount ?? 0);
  const pendingAmount = Math.max(finalAmount - paidAmount, 0);

  React.useEffect(() => {
    const loadBookedDates = async () => {
      setCalendarLoading(true);
      try {
        const response = await apiFetch('/bookings');
        const result = await parseJsonSafe(response);
        if (!response.ok) {
          throw new Error(result?.error || result?.message || 'Unable to load booking calendar');
        }
        const reserved = new Set<string>();
        (result?.bookings || []).forEach((booking: any) => {
          if (booking?.status === 'canceled') return;
          const checkin = booking?.checkinDate ? new Date(booking.checkinDate) : null;
          const checkout = booking?.checkoutDate ? new Date(booking.checkoutDate) : null;
          if (checkin && checkout && !Number.isNaN(checkin.getTime()) && !Number.isNaN(checkout.getTime()) && checkout > checkin) {
            const cursor = new Date(checkin);
            while (cursor < checkout) {
              reserved.add(cursor.toISOString().split('T')[0]);
              cursor.setDate(cursor.getDate() + 1);
            }
          }
        });
        setBookedDates(Array.from(reserved));
      } catch {
        setBookedDates([]);
      } finally {
        setCalendarLoading(false);
      }
    };

    void loadBookedDates();
  }, []);

  const renderBookingCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const cells: React.ReactNode[] = [];

    for (let i = 0; i < startWeekDay; i++) {
      cells.push(<div key={`booking-details-blank-${i}`} />);
    }

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const key = date.toISOString().split('T')[0];
      const isBooked = bookedDates.includes(key);
      cells.push(
        <div
          key={key}
          className={`calendar-day-card settings-day-card ${isBooked ? 'is-booked' : 'is-available'}`}
          style={{
            minHeight: 'clamp(44px, 11vw, 58px)',
            border: '1px solid #e2e8f0',
            borderRadius: '7px',
            padding: 'clamp(2px, 0.8vw, 4px)',
            background: isBooked ? '#dc2626' : '#f8fafc'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 'clamp(0.62rem, 2vw, 0.74rem)', color: isBooked ? '#fff' : '#0f172a', lineHeight: 1.1 }}>{day}</div>
          <div className="calendar-day-sub" style={{ fontSize: 'clamp(0.5rem, 1.7vw, 0.6rem)', color: isBooked ? '#fff' : '#64748b', marginTop: '2px', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {isBooked ? 'Booked' : 'Available'}
          </div>
        </div>
      );
    }

    return cells;
  };

  const handlePayNow = async () => {
    if (!record) return;
    const cleanCode = String(record.bookingCode || bookingCode).replace(/\D/g, '').slice(0, 4);
    const cleanMobile = String(record.mobile || mobile).replace(/\D/g, '').slice(-10);
    if (cleanCode.length !== 4 || cleanMobile.length !== 10) {
      setError('Unable to start payment. Please verify booking details again.');
      return;
    }

    try {
      setPaying(true);
      setError('');
      await onPayNow(cleanCode, cleanMobile);
    } catch (err: any) {
      setError(err?.message || 'Unable to open pending payment');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="surface-card" style={{ background: 'rgba(255,255,255,0.96)', borderRadius: '20px', padding: '28px', maxWidth: '860px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Your Booking</h2>
        <p style={{ margin: '0 0 16px 0', color: '#475569' }}>Enter Allotment No. and mobile number to view your booking.</p>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', background: '#ffffff', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>Check Date Calendar</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', background: '#f8fafc', cursor: 'pointer' }}
              >
                Prev
              </button>
              <div style={{ fontWeight: 700, color: '#0f172a', minWidth: '145px', textAlign: 'center' }}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', background: '#f8fafc', cursor: 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
          <div className="calendar-weekdays-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px', marginBottom: '6px', fontSize: '0.73rem', fontWeight: 700, color: '#475569' }}>
            <div style={{ textAlign: 'center' }}>Sun</div>
            <div style={{ textAlign: 'center' }}>Mon</div>
            <div style={{ textAlign: 'center' }}>Tue</div>
            <div style={{ textAlign: 'center' }}>Wed</div>
            <div style={{ textAlign: 'center' }}>Thu</div>
            <div style={{ textAlign: 'center' }}>Fri</div>
            <div style={{ textAlign: 'center' }}>Sat</div>
          </div>
          <div className="calendar-days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
            {renderBookingCalendar()}
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#475569' }}>
            {calendarLoading ? 'Loading booking calendar...' : 'Booked dates are highlighted. Availability is shown for quick check.'}
          </div>
        </div>

        <form onSubmit={handleLookup} style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
          <input
            type="text"
            inputMode="numeric"
            value={bookingCode}
            onChange={(e) => setBookingCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4-digit Allotment No."
            style={{ padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
            required
          />
          <input
            type="tel"
            inputMode="numeric"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit mobile number"
            style={{ padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{ border: 'none', borderRadius: '10px', padding: '11px 14px', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Checking...' : 'View Booking'}
          </button>
        </form>

        {error && (
          <div style={{ marginBottom: '12px', borderRadius: '10px', padding: '10px 12px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {record && (
          <div style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'grid', gap: '8px', color: '#0f172a', fontSize: '0.93rem' }}>
              <div><strong>Allotment No.:</strong> {record.bookingCode || '----'}</div>
              <div><strong>Name:</strong> {record.name}</div>
              <div><strong>Mobile:</strong> {record.mobile}</div>
              <div><strong>Purpose:</strong> {getPurposeLabel(record)}</div>
              <div><strong>Check-in:</strong> {new Date(record.checkinDate).toLocaleDateString('en-IN')}</div>
              <div><strong>Check-out:</strong> {new Date(record.checkoutDate).toLocaleDateString('en-IN')}</div>
              <div><strong>Final Amount:</strong> Rs {finalAmount}</div>
              <div><strong>Paid:</strong> Rs {paidAmount}</div>
              <div><strong>Pending:</strong> Rs {pendingAmount}</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
          {record && pendingAmount > 0 && (
            <button
              onClick={handlePayNow}
              disabled={paying}
              style={{ border: 'none', borderRadius: '10px', padding: '10px 14px', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.85 : 1 }}
            >
              {paying ? 'Opening Payment...' : `Pay Pending Rs ${pendingAmount}`}
            </button>
          )}
          <button
            onClick={onBack}
            style={{ border: 'none', borderRadius: '10px', padding: '10px 14px', background: '#64748b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
};
// Confirmation Page
const ConfirmationPage: React.FC<{
  bookingData: BookingData;
  saveError: string;
  onViewBookingDetails: () => void;
  onNewBooking: () => void;
}> = ({ bookingData, saveError, onViewBookingDetails, onNewBooking }) => {
  const bookingCode = bookingData.bookingCode || '----';
  const qrPayload = JSON.stringify({
    allotmentNumber: bookingCode,
    name: bookingData.name,
    mobile: bookingData.mobile,
    checkinDate: bookingData.checkinDate,
    checkoutDate: bookingData.checkoutDate
  });
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrPayload)}`;
  const paidAmount = Math.max(Number(bookingData.paymentAmount || 0), 0);
  const remainingAmount = Math.max(Number(bookingData.totalAmount || 0) - paidAmount, 0);
  const purposeLabel = bookingData.purpose ? bookingData.purpose.charAt(0).toUpperCase() + bookingData.purpose.slice(1) : 'Stay';
  const genderLabel = bookingData.gender ? bookingData.gender.charAt(0).toUpperCase() + bookingData.gender.slice(1) : 'Not specified';
  const formatDateLong = (value: string) => {
    if (!value) return 'Not selected';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  const checkinLabel = formatDateLong(bookingData.checkinDate);
  const checkoutLabel = formatDateLong(bookingData.checkoutDate);
  const receiptFileCode = bookingCode === '----' ? 'booking' : bookingCode;

  const downloadReceipt = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const startX = 56.69;
      const tableWidth = pageWidth - startX * 2;
      const labelColWidth = 198.42;
      const rowHeight = 18;
      const valueMaxWidth = tableWidth - labelColWidth - 16;
      let cursorY = 74;

      const centerText = (text: string, y: number, fontName: 'helvetica', fontStyle: 'normal' | 'bold', fontSize: number) => {
        doc.setFont(fontName, fontStyle);
        doc.setFontSize(fontSize);
        const width = doc.getTextWidth(text);
        doc.text(text, (pageWidth - width) / 2, y);
      };

      const drawSectionTable = (title: string, rows: Array<[string, string]>) => {
        const tableTop = cursorY;
        const tableHeight = (rows.length + 1) * rowHeight;
        const splitX = startX + labelColWidth;

        doc.setFillColor(211, 211, 211);
        doc.rect(startX, tableTop, tableWidth, rowHeight, 'F');

        doc.setDrawColor(128, 128, 128);
        doc.setLineWidth(0.5);
        doc.rect(startX, tableTop, tableWidth, tableHeight);

        for (let index = 1; index <= rows.length; index += 1) {
          const y = tableTop + index * rowHeight;
          doc.line(startX, y, startX + tableWidth, y);
        }

        doc.line(splitX, tableTop + rowHeight, splitX, tableTop + tableHeight);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(title, startX + 6, tableTop + 13);

        rows.forEach((row, index) => {
          const y = tableTop + rowHeight * (index + 1) + 13;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text(row[0], startX + 6, y);

          let valueText = row[1] || '-';
          let valueFontSize = 10;
          doc.setFontSize(valueFontSize);
          while (doc.getTextWidth(valueText) > valueMaxWidth && valueFontSize > 8) {
            valueFontSize -= 0.4;
            doc.setFontSize(valueFontSize);
          }
          doc.text(valueText, splitX + 6, y);
        });

        cursorY = tableTop + tableHeight + 20;
      };

      centerText('Booking Receipt', cursorY, 'helvetica', 'bold', 18);
      cursorY += 26;
      centerText('Thank you! Your booking has been successfully confirmed.', cursorY, 'helvetica', 'normal', 10);
      cursorY += 22;

      drawSectionTable('Reservation Details', [
        ['Name', bookingData.name || '-'],
        ['Allotment Number', bookingCode],
        ['Mobile Number', bookingData.mobile || '-'],
        ['Purpose of Visit', purposeLabel],
        ['Email Address', bookingData.email || '-']
      ]);

      drawSectionTable('Stay Details', [
        ['Check-in Date', checkinLabel],
        ['Check-out Date', checkoutLabel]
      ]);

      drawSectionTable('Payment Details', [
        ['Advance Payment Paid', `Rs ${paidAmount.toLocaleString('en-IN')}`],
        ['Payment Status', 'PAID'],
        ['Remaining Balance', `Rs ${remainingAmount.toLocaleString('en-IN')}`]
      ]);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Please present this receipt or your allotment number during check-in.', startX, cursorY);

      doc.save(`booking_receipt_${receiptFileCode}.pdf`);
    } catch {
      const lines = [
        'BOOKING RECEIPT',
        '',
        `Allotment Number: ${bookingCode}`,
        `Name: ${bookingData.name || '-'}`,
        `Mobile Number: ${bookingData.mobile || '-'}`,
        `Purpose of Visit: ${purposeLabel}`,
        `Email Address: ${bookingData.email || '-'}`,
        '',
        `Check-in Date: ${checkinLabel}`,
        `Check-out Date: ${checkoutLabel}`,
        '',
        `Advance Payment Paid: Rs ${paidAmount}`,
        `Remaining Balance: Rs ${remainingAmount}`,
        'Payment Status: PAID'
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `booking-receipt-${receiptFileCode}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }
  };

  return (
    <div
      className="page-center"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '20px',
        background: '#f4f5fb'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1060px',
          borderRadius: '40px',
          border: '1px solid #d7dee9',
          background: 'linear-gradient(180deg, #fbfcfe 0%, #f5f7fb 100%)',
          boxShadow: '0 28px 60px rgba(15, 23, 42, 0.14)',
          padding: '26px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '-15%',
            right: '-15%',
            top: '66px',
            height: '170px',
            background: 'radial-gradient(110% 85% at 50% 100%, rgba(213,223,218,0.52) 0%, rgba(245,249,253,0.05) 75%)',
            pointerEvents: 'none'
          }}
        />
        <div style={{ position: 'absolute', top: '66px', left: '7%', width: '12px', height: '22px', borderRadius: '10px', transform: 'rotate(-32deg)', background: '#7dc7bd', opacity: 0.9 }} />
        <div style={{ position: 'absolute', top: '90px', left: '13%', width: '14px', height: '8px', borderRadius: '12px', transform: 'rotate(-8deg)', background: '#e5ba70', opacity: 0.95 }} />
        <div style={{ position: 'absolute', top: '94px', left: '24%', width: '10px', height: '16px', borderRadius: '8px', transform: 'rotate(-40deg)', background: '#60b6a8', opacity: 0.92 }} />
        <div style={{ position: 'absolute', top: '78px', left: '39%', width: '14px', height: '14px', borderRadius: '10px', transform: 'rotate(22deg)', background: '#e9bd66', opacity: 0.9 }} />
        <div style={{ position: 'absolute', top: '88px', right: '37%', width: '9px', height: '18px', borderRadius: '10px', transform: 'rotate(-52deg)', background: '#8dc581', opacity: 0.92 }} />
        <div style={{ position: 'absolute', top: '72px', right: '20%', width: '10px', height: '18px', borderRadius: '10px', transform: 'rotate(-18deg)', background: '#7ac1ae', opacity: 0.9 }} />
        <div style={{ position: 'absolute', top: '98px', right: '9%', width: '13px', height: '8px', borderRadius: '8px', transform: 'rotate(4deg)', background: '#7cc9c0', opacity: 0.9 }} />

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '46px', marginBottom: '14px' }}>
          <div
            style={{
              width: '138px',
              height: '138px',
              borderRadius: '999px',
              border: '7px solid #e6edf6',
              background: 'linear-gradient(140deg, #2f9f4f 0%, #1f9a45 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 14px 28px rgba(22, 163, 74, 0.32)'
            }}
          >
            <svg width="80" height="80" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <path d="M14 27L22 35L38 17" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <h1 style={{ margin: '0 0 8px 0', textAlign: 'center', color: '#0c544a', fontSize: 'clamp(2.2rem, 4.6vw, 4.25rem)', fontWeight: 500 }}>
          Booking Confirmed
        </h1>
        <p style={{ margin: '0 0 24px 0', textAlign: 'center', color: '#273142', fontSize: 'clamp(1.2rem, 2.4vw, 2.05rem)' }}>
          Thank you! Your reservation has been successfully confirmed.
        </p>

        {saveError && (
          <div
            style={{
              marginBottom: '16px',
              borderRadius: '12px',
              border: '1px solid #f8d3a1',
              background: '#fff8e8',
              padding: '10px 12px',
              color: '#8a5a00',
              fontSize: '0.95rem'
            }}
          >
            MongoDB save warning: {saveError}
          </div>
        )}

        <div
          style={{
            borderRadius: '24px',
            border: '1px solid #d7dee9',
            background: '#f9fbfd',
            padding: '20px',
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)',
            position: 'relative',
            zIndex: 1
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <span
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '999px',
                background: '#42a35f',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                fontWeight: 800
              }}
            >
              &#10003;
            </span>
            <h3 style={{ margin: 0, color: '#111827', fontSize: 'clamp(1.5rem, 2.8vw, 2.8rem)' }}>Reservation Details</h3>
          </div>

          <div
            style={{
              borderRadius: '18px',
              border: '1px solid #d8dee9',
              background: '#f8fafc',
              padding: '16px',
              display: 'flex',
              gap: '14px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ flex: '1 1 360px', display: 'grid', gap: '10px', color: '#121b2d', fontSize: 'clamp(1.1rem, 1.95vw, 2rem)' }}>
              <div><strong>Name:</strong> {bookingData.name || '-'}</div>
              <div><strong>Allotment Number:</strong> <span style={{ color: '#12634f', fontWeight: 800 }}>{bookingCode}</span></div>
              <div><strong>Mobile Number:</strong> {bookingData.mobile || '-'}</div>
              <div><strong>Purpose of Visit:</strong> {purposeLabel}</div>
              <div><strong>Gender:</strong> {genderLabel}</div>
              <div><strong>Email Address:</strong> {bookingData.email || '-'}</div>
            </div>
            <div
              style={{
                flex: '0 1 260px',
                minWidth: '210px',
                marginLeft: 'auto',
                borderRadius: '16px',
                border: '1px solid #d8dee9',
                background: '#ffffff',
                padding: '10px',
                textAlign: 'center'
              }}
            >
              <img
                src={qrCodeUrl}
                alt="Booking QR code"
                style={{ width: '100%', maxWidth: '220px', height: '220px', objectFit: 'contain', borderRadius: '10px' }}
              />
              <div style={{ marginTop: '8px', borderTop: '1px solid #e5e7eb', paddingTop: '8px', fontSize: 'clamp(0.95rem, 1.6vw, 1.4rem)', color: '#1f2937' }}>
                Booking ID: <strong style={{ color: '#0f513f' }}>#RK{String(bookingCode).replace(/\D/g, '') || bookingCode}</strong>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <div
            style={{
              borderRadius: '24px',
              border: '1px solid #d7dee9',
              background: '#f9fbfd',
              padding: '18px',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)'
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', color: '#111827', fontSize: 'clamp(1.4rem, 2.4vw, 2.4rem)' }}>Stay Details</h3>
            <div style={{ color: '#1f2937', fontWeight: 700, fontSize: 'clamp(1.12rem, 1.95vw, 1.75rem)', marginBottom: '6px' }}>Check-in Date:</div>
            <div style={{ color: '#273142', fontSize: 'clamp(1.05rem, 1.8vw, 1.58rem)', marginBottom: '14px' }}>{checkinLabel}</div>
            <div style={{ color: '#1f2937', fontWeight: 700, fontSize: 'clamp(1.12rem, 1.95vw, 1.75rem)', marginBottom: '6px' }}>Check-out Date:</div>
            <div style={{ color: '#273142', fontSize: 'clamp(1.05rem, 1.8vw, 1.58rem)' }}>{checkoutLabel}</div>
          </div>

          <div
            style={{
              borderRadius: '24px',
              border: '1px solid #d7dee9',
              background: '#f9fbfd',
              padding: '18px',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)'
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', color: '#111827', fontSize: 'clamp(1.4rem, 2.4vw, 2.4rem)' }}>Payment Details</h3>
            <div style={{ color: '#1f2937', fontSize: 'clamp(1.12rem, 1.95vw, 1.75rem)', marginBottom: '8px' }}>
              Advance Payment Paid: <strong style={{ color: '#0f513f' }}>Rs {paidAmount.toLocaleString('en-IN')}</strong>
            </div>
            <div style={{ color: '#1f2937', fontSize: 'clamp(1.12rem, 1.95vw, 1.75rem)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Payment Status:</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '999px',
                  background: '#2f9058',
                  color: '#fff',
                  padding: '2px 14px',
                  fontWeight: 700,
                  fontSize: 'clamp(0.95rem, 1.55vw, 1.25rem)'
                }}
              >
                Paid
              </span>
            </div>
            <div style={{ color: '#1f2937', fontSize: 'clamp(1.15rem, 2.05vw, 1.86rem)', fontWeight: 700, marginBottom: '8px' }}>
              Remaining Balance: <span style={{ color: remainingAmount > 0 ? '#b91c1c' : '#0f513f' }}>Rs {remainingAmount.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ color: '#3a4559', fontSize: 'clamp(0.95rem, 1.55vw, 1.28rem)' }}>
              Please ensure the remaining balance is cleared before check-in.
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#111827', fontSize: 'clamp(1.5rem, 2.7vw, 2.6rem)' }}>Next Steps</h3>
          <div style={{ display: 'grid', gap: '8px' }}>
            {[
              'Show your allotment number or QR code at check-in',
              'Clear remaining balance before check-in',
              'Keep this confirmation handy for reference'
            ].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1f2937', fontSize: 'clamp(1.08rem, 1.9vw, 1.62rem)' }}>
                <span
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '999px',
                    background: '#41a465',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    fontWeight: 800
                  }}
                >
                  &#10003;
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '18px', borderTop: '1px solid #d7dee9', paddingTop: '14px', display: 'grid', gap: '10px' }}>
          <button
            onClick={downloadReceipt}
            style={{
              width: '100%',
              border: '1px solid #c8d0dc',
              borderRadius: '20px',
              padding: '14px 16px',
              background: '#f7f9fc',
              color: '#115344',
              fontSize: 'clamp(1.15rem, 2vw, 1.85rem)',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 14px rgba(15, 23, 42, 0.08)'
            }}
          >
            Download Booking Receipt
          </button>
          <button
            onClick={onNewBooking}
            style={{
              width: '100%',
              border: '1px solid #1b7d67',
              borderRadius: '22px',
              padding: '15px 16px',
              background: 'linear-gradient(135deg, #1f8f76 0%, #2b9a81 100%)',
              color: '#fff',
              fontSize: 'clamp(1.2rem, 2.2vw, 1.95rem)',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 10px 22px rgba(31, 143, 118, 0.32)'
            }}
          >
            Make Another Booking
          </button>
          <button
            onClick={onViewBookingDetails}
            style={{
              width: '100%',
              border: '1px solid #d4dbe6',
              borderRadius: '22px',
              padding: '14px 16px',
              background: '#f8f9fc',
              color: '#1b4b43',
              fontSize: 'clamp(1.18rem, 2.1vw, 1.9rem)',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            View Booking Details
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminLoginPage: React.FC<{ onBack: () => void; onLoginSuccess: (token: string) => void }> = ({ onBack, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await apiFetch('/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Invalid admin credentials');
      }
      const token = String(result?.token || '');
      if (!token) {
        throw new Error('Admin login token missing in response');
      }
      onLoginSuccess(token);
    } catch (err: any) {
      setError(err?.message || 'Invalid admin credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-center" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="surface-card" style={{
        width: '100%',
        maxWidth: '420px',
        borderRadius: '24px',
        padding: '28px',
        background: 'linear-gradient(160deg, #ffffff 0%, #f1f5f9 100%)',
        boxShadow: '0 18px 50px rgba(15, 23, 42, 0.2)'
      }}>
        <button
          onClick={onBack}
          className="compact-back-btn"
          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', marginBottom: '14px', fontSize: '0.92rem', fontWeight: 600 }}
        >
          Back
        </button>
        <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Admin Login</h2>
        <p style={{ margin: '0 0 20px 0', color: '#475569' }}>Sign in to view booking dashboard</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Admin Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: '100%',
              marginBottom: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              boxSizing: 'border-box'
            }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              marginBottom: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              boxSizing: 'border-box'
            }}
            required
          />
          {error && <div style={{ color: '#dc2626', marginBottom: '12px', fontSize: '0.9rem' }}>{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: '12px',
              padding: '12px',
              background: 'linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%)',
              color: 'white',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.8 : 1
            }}
          >
            {submitting ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

const AdminPanelPage: React.FC<{
  hallImageUrls: string[];
  setHallImageUrls: (imageUrls: string[]) => void;
  onBackToBooking: () => void;
  adminToken: string;
  onLogout: () => void;
}> = ({ hallImageUrls, setHallImageUrls, onBackToBooking, adminToken, onLogout }) => {
  const getStoredString = (key: string, fallback = '') => {
    try {
      const value = window.localStorage.getItem(key);
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const getStoredStringArray = (key: string, fallback: string[] = []) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;
      return parsed.filter((item) => typeof item === 'string' && item.trim());
    } catch {
      return fallback;
    }
  };

  const [records, setRecords] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteCustomReason, setDeleteCustomReason] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    mobile: '',
    bookingPurpose: 'function' as 'meeting' | 'camp' | 'picnic' | 'function' | 'program' | 'other',
    bookingPurposeOther: '',
    checkinDate: '',
    checkoutDate: '',
    paymentAmount: 0,
    paymentType: 'advance' as 'advance' | 'full' | 'custom',
    totalAmount: 0,
    discountType: 'none' as 'none' | 'percentage' | 'flat',
    discountValue: 0
  });
  const [adminBookingForm, setAdminBookingForm] = useState({
    name: '',
    mobile: '',
    checkinDate: '',
    checkoutDate: '',
    bookingPurpose: 'meeting' as 'meeting' | 'camp' | 'picnic' | 'function' | 'program' | 'other',
    bookingPurposeOther: ''
  });
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedOfferCode, setSelectedOfferCode] = useState('');
  const [offerForm, setOfferForm] = useState({
    name: '',
    checkin: '',
    checkout: '',
    roomType: '',
    original: '',
    discount: '',
    total: '',
    paymentStatus: ''
  });
  const [notificationTemplateById, setNotificationTemplateById] = useState<Record<string, CustomerNotificationTemplate>>({});
  const [selectedHallImageIndex, setSelectedHallImageIndex] = useState(0);
  const [adminLogoUrl, setAdminLogoUrl] = useState<string>(() => getStoredString(ADMIN_LOGO_STORAGE_KEY, ''));
  type AdminContact = { name: string; profileType: string; contact: string };
  const [contactList, setContactList] = useState<AdminContact[]>(() => {
    try {
      const raw = window.localStorage.getItem('adminContactList');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const safe = parsed
            .map((item) => ({
              name: String(item?.name || ''),
              profileType: String(item?.profileType || ''),
              contact: String(item?.contact || '')
            }))
            .filter((item) => item.name || item.profileType || item.contact);
          if (safe.length) return safe.slice(0, 20);
        }
      }
    } catch {
      // ignore parsing errors and fall back
    }

    // Backward compatibility with older single-contact storage.
    const legacyName = getStoredString('adminContactName');
    const legacyContact = getStoredString('adminContactDetails');
    if (legacyName || legacyContact) {
      return [{ name: legacyName, profileType: '', contact: legacyContact }];
    }
    return [{ name: '', profileType: '', contact: '' }];
  });
  const [serviceProviderList, setServiceProviderList] = useState<AdminContact[]>(() => {
    try {
      const raw = window.localStorage.getItem('adminServiceProviderList');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const safe = parsed
            .map((item) => ({
              name: String(item?.name || ''),
              profileType: String(item?.profileType || ''),
              contact: String(item?.contact || '')
            }))
            .filter((item) => item.name || item.profileType || item.contact);
          if (safe.length) return safe.slice(0, 20);
        }
      }
    } catch {
      // ignore parsing errors and fall back
    }
    return [{ name: '', profileType: '', contact: '' }];
  });
  type AdminComplain = {
    id: string;
    name: string;
    mobile: string;
    bookingCode: string;
    message: string;
    createdAt: string;
    status: 'open' | 'resolved';
  };
  const normalizeComplainList = (raw: any[]): AdminComplain[] => {
    return raw
      .map((item, idx): AdminComplain => {
        if (typeof item === 'string') {
          return {
            id: `legacy_cmp_${idx}`,
            name: 'Guest',
            mobile: '',
            bookingCode: '',
            message: item,
            createdAt: new Date().toISOString(),
            status: 'open'
          };
        }
        const status: 'open' | 'resolved' = item?.status === 'resolved' ? 'resolved' : 'open';
        return {
          id: String(item?.id || `cmp_${idx}`),
          name: String(item?.name || 'Guest'),
          mobile: String(item?.mobile || ''),
          bookingCode: String(item?.bookingCode || ''),
          message: String(item?.message || ''),
          createdAt: String(item?.createdAt || new Date().toISOString()),
          status
        };
      })
      .filter((item) => item.message.trim());
  };
  const [complainList, setComplainList] = useState<AdminComplain[]>(() => {
    try {
      const raw = window.localStorage.getItem('publicComplainList');
      const parsed = raw ? JSON.parse(raw) : [];
      return normalizeComplainList(Array.isArray(parsed) ? parsed : []);
    } catch {
      return [];
    }
  });
  type AdminFeedback = {
    id: string;
    name: string;
    phone: string;
    message: string;
    createdAt: string;
  };
  const normalizeFeedbackList = (raw: any[]): AdminFeedback[] => {
    return raw
      .map((item, idx): AdminFeedback => {
        if (typeof item === 'string') {
          return {
            id: `legacy_fb_${idx}`,
            name: 'Guest',
            phone: '',
            message: item,
            createdAt: new Date().toISOString()
          };
        }
        return {
          id: String(item?.id || `fb_${idx}`),
          name: String(item?.name || 'Guest'),
          phone: String(item?.phone || ''),
          message: String(item?.message || ''),
          createdAt: String(item?.createdAt || new Date().toISOString())
        };
      })
      .filter((item) => item.message.trim());
  };
  const [feedbackList, setFeedbackList] = useState<AdminFeedback[]>(() => {
    try {
      const raw = window.localStorage.getItem('publicFeedbackList');
      const parsed = raw ? JSON.parse(raw) : [];
      return normalizeFeedbackList(Array.isArray(parsed) ? parsed : []);
    } catch {
      return [];
    }
  });
  const paymentApprovalByBooking = React.useMemo(() => createApprovalMapFromBookings(records), [records]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem('adminContactList', JSON.stringify(contactList));
      window.localStorage.setItem('adminServiceProviderList', JSON.stringify(serviceProviderList));
      window.localStorage.setItem('publicComplainList', JSON.stringify(complainList));
      window.localStorage.setItem('publicFeedbackList', JSON.stringify(feedbackList));
    } catch {
      // ignore storage errors
    }
  }, [contactList, serviceProviderList, complainList, feedbackList]);

  const removeComplain = (id: string) => {
    setComplainList((prev) => prev.filter((item) => item.id !== id));
  };

  const removeFeedback = (id: string) => {
    setFeedbackList((prev) => prev.filter((item) => item.id !== id));
  };

  const resolveAndWhatsappComplain = (item: AdminComplain) => {
    const digits = item.mobile.replace(/\D/g, '');
    const resolutionMessage = `Hello ${item.name || 'Guest'}, your complaint${item.bookingCode ? ` (Allotment No.: ${item.bookingCode})` : ''} has been resolved. Thank you for your patience.`;
    if (digits.length >= 10) {
      const whatsappUrl = `https://wa.me/91${digits}?text=${encodeURIComponent(resolutionMessage)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      alert('Mobile number not available for this complaint');
    }
    removeComplain(item.id);
  };

  const handleUnauthorizedAdminResponse = (response: Response, fallbackMessage: string) => {
    if (response.status === 401 || response.status === 403) {
      onLogout();
      throw new Error('Admin session expired. Please login again.');
    }
    throw new Error(fallbackMessage);
  };

  const persistUiAssets = async (updates: { hallImageUrls?: string[]; adminLogoUrl?: string }) => {
    const applyLocalFallback = () => {
      if (Object.prototype.hasOwnProperty.call(updates, 'hallImageUrls')) {
        const nextHallImages = normalizeHallImageUrls(updates.hallImageUrls ?? []);
        setHallImageUrls(nextHallImages);
        saveHallImagesToLocalStorage(nextHallImages);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'adminLogoUrl')) {
        const nextLogo = updates.adminLogoUrl || '';
        setAdminLogoUrl(nextLogo);
        saveAdminLogoToLocalStorage(nextLogo);
      }
    };

    let response: Response;
    let result: any;
    try {
      response = await apiFetch('/settings/ui-assets', {
        method: 'PATCH',
        headers: withAdminAuth(adminToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates)
      });
      result = await parseJsonSafe(response);
    } catch {
      applyLocalFallback();
      return;
    }

    if (!response.ok) {
      if (response.status === 404 || response.status === 405) {
        applyLocalFallback();
        return;
      }
      handleUnauthorizedAdminResponse(
        response,
        result?.error || result?.message || 'Unable to update image settings'
      );
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'hallImageUrls')) {
      const nextHallImages = normalizeHallImageUrls(
        result?.settings?.hallImageUrls ?? updates.hallImageUrls ?? []
      );
      setHallImageUrls(nextHallImages);
      saveHallImagesToLocalStorage(nextHallImages);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'adminLogoUrl')) {
      const nextLogo = typeof result?.settings?.adminLogoUrl === 'string'
        ? result.settings.adminLogoUrl
        : (updates.adminLogoUrl || '');
      setAdminLogoUrl(nextLogo);
      saveAdminLogoToLocalStorage(nextLogo);
    }
  };

  const loadRecords = React.useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await apiFetch('/bookings', {
        headers: withAdminAuth(adminToken)
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        handleUnauthorizedAdminResponse(
          response,
          result?.error || result?.message || 'Unable to load bookings'
        );
      }
      setRecords(result?.bookings || []);
    } catch (err: any) {
      if (!silent) {
        setError(err?.message || 'Unable to load bookings');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [adminToken, onLogout]);

  const exportExcel = async () => {
    setError('');
    try {
      const response = await apiFetch('/bookings/export', {
        headers: withAdminAuth(adminToken)
      });
      if (!response.ok) {
        handleUnauthorizedAdminResponse(response, 'Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bookings-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Export failed');
    }
  };

  const importExcel = async (file: File) => {
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiFetch('/bookings/import', {
        method: 'POST',
        headers: withAdminAuth(adminToken),
        body: formData
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        handleUnauthorizedAdminResponse(response, result?.error || result?.message || 'Import failed');
      }
      await loadRecords();
      alert(`Import success. ${result.importedCount || 0} record(s) added.`);
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    }
  };

  const shareBookings = async () => {
    const confirmed = records.filter((r) => r.status === 'confirmed').length;
    const message = `Bookings: ${records.length}, Confirmed: ${confirmed}. Dashboard: ${window.location.href}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Booking Dashboard Summary',
          text: message
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        alert('Booking summary copied to clipboard');
      } else {
        alert(message);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to share booking summary');
    }
  };

  React.useEffect(() => {
    void loadRecords();
    const timer = window.setInterval(() => {
      void loadRecords({ silent: true });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadRecords]);

  const upcomingBookings = records
    .filter((r) => r.status !== 'canceled' && new Date(r.checkoutDate) >= new Date())
    .sort((a, b) => new Date(a.checkinDate).getTime() - new Date(b.checkinDate).getTime());

  React.useEffect(() => {
    if (!upcomingBookings.length) {
      setSelectedOfferCode('');
      return;
    }
    if (!selectedOfferCode || !upcomingBookings.some((r) => r.bookingCode === selectedOfferCode)) {
      setSelectedOfferCode(upcomingBookings[0].bookingCode || '');
    }
  }, [records]);

  const selectedOfferBooking = upcomingBookings.find((r) => r.bookingCode === selectedOfferCode) || null;
  const selectedOfferApproval = selectedOfferBooking ? paymentApprovalByBooking[selectedOfferBooking._id] : undefined;
  const selectedOfferUserMarked = Boolean(selectedOfferApproval?.userMarked);
  const selectedOfferAdminApproved = Boolean(selectedOfferApproval?.adminApproved);
  const selectedOfferAdminRejected = Boolean(selectedOfferApproval?.adminRejected);
  const pendingApprovalRecords = records.filter((row) => {
    const state = paymentApprovalByBooking[row._id];
    return Boolean(state?.userMarked) && !state?.adminApproved && !state?.adminRejected;
  });
  const pendingApprovalCount = pendingApprovalRecords.length;
  const latestPendingRequest = pendingApprovalRecords[0];
  const latestPendingRequestAmount = latestPendingRequest ? Number(latestPendingRequest.paymentAmount || 0) : 0;
  const latestPendingRequestDetails = latestPendingRequest
    ? ` | Allotment No. ${latestPendingRequest.bookingCode || '----'} | ${latestPendingRequest.name || 'Guest'} | Check-in ${new Date(latestPendingRequest.checkinDate).toLocaleDateString('en-IN')} | Check-out ${new Date(latestPendingRequest.checkoutDate).toLocaleDateString('en-IN')}`
    : '';
  const selectedOfferFinalAmount = Number(selectedOfferBooking?.finalAmount ?? selectedOfferBooking?.totalAmount ?? 0);
  const selectedOfferOriginalAmount = Number(selectedOfferBooking?.totalAmount ?? 0);
  const selectedOfferPaidAmount = Number(selectedOfferBooking?.paymentAmount ?? 0);
  const selectedOfferPendingAmount = Math.max(selectedOfferFinalAmount - selectedOfferPaidAmount, 0);
  const selectedOfferDiscountAmount = Math.max(
    Number(selectedOfferBooking?.discountAmount ?? (selectedOfferOriginalAmount - selectedOfferFinalAmount)),
    0
  );
  const selectedOfferPaymentStatus = selectedOfferPendingAmount > 0 ? `Pending Rs ${selectedOfferPendingAmount}` : 'Fully Paid';
  const selectedOfferRoomType =
    selectedOfferBooking?.bookingPurpose === 'other'
      ? (selectedOfferBooking?.bookingPurposeOther || 'Other')
      : (selectedOfferBooking?.bookingPurpose || 'Standard');
  const editingRecord = editingId ? records.find((row) => row._id === editingId) || null : null;
  const editingHeaderName = (editForm.name || editingRecord?.name || 'Guest').trim() || 'Guest';
  const editingHeaderCode = String(editingRecord?.bookingCode || '').trim();
  const upcomingTickerText = upcomingBookings.length
    ? (() => {
        const row = upcomingBookings[0];
        const finalAmount = Number(row.finalAmount ?? row.totalAmount ?? 0);
        const pendingAmount = Math.max(finalAmount - Number(row.paymentAmount ?? 0), 0);
        return `Allotment No. ${row.bookingCode || '----'} | Check-in ${new Date(row.checkinDate).toLocaleDateString('en-IN')} | Check-out ${new Date(row.checkoutDate).toLocaleDateString('en-IN')} | Pending Rs ${pendingAmount}`;
      })()
    : 'No upcoming booking details';
  React.useEffect(() => {
    if (!selectedOfferBooking) {
      setOfferForm({
        name: '',
        checkin: '',
        checkout: '',
        roomType: '',
        original: '',
        discount: '',
        total: '',
        paymentStatus: ''
      });
      return;
    }

    setOfferForm({
      name: selectedOfferBooking.name || 'Customer',
      checkin: new Date(selectedOfferBooking.checkinDate).toLocaleDateString('en-IN'),
      checkout: new Date(selectedOfferBooking.checkoutDate).toLocaleDateString('en-IN'),
      roomType: selectedOfferRoomType,
      original: String(selectedOfferOriginalAmount),
      discount: String(selectedOfferDiscountAmount),
      total: String(selectedOfferFinalAmount),
      paymentStatus: selectedOfferPaymentStatus
    });
  }, [selectedOfferCode, records]);

  const renderedOfferMessage = selectedOfferBooking
    ? `Dear ${offerForm.name || 'Guest'},\n\n` +
      `We are pleased to confirm your booking with the following details:\n\n` +
      `Guest Name: ${offerForm.name}\n` +
      `Check-in / Check-out: ${offerForm.checkin} – ${offerForm.checkout}\n` +
      `Hall/Room Purpose: ${offerForm.roomType}\n\n` +
      `Original Amount: Rs ${offerForm.original || '0'}\n` +
      `Discount Applied: Rs ${offerForm.discount || '0'}\n` +
      `Final Payable Amount: Rs ${offerForm.total || '0'}\n\n` +
      `Payment Status: ${offerForm.paymentStatus}\n\n` +
      `You have received a discount of Rs ${offerForm.discount || '0'}. The final payable amount has been updated accordingly.\n\n` +
      `Important Payment Information\n\n` +
      `Kindly ensure that any pending balance is cleared prior to check-in, along with a refundable security deposit of Rs 500.\n\n` +
      `Additionally, a separate Rs 500 electricity security deposit will be collected at the time of check-in. This amount will be refunded at check-out after adjustment against actual electricity consumption, if applicable.\n\n` +
      `Please disregard this notice if the required payments have already been completed.`
    : '';

  const copyOfferMessage = async () => {
    if (!renderedOfferMessage) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(renderedOfferMessage);
        alert('Offer message copied');
        return;
      }
      alert(renderedOfferMessage);
    } catch (err: any) {
      setError(err?.message || 'Unable to copy offer message');
    }
  };

  const selectedHallImageUrl = hallImageUrls[selectedHallImageIndex] || '';
  const isCustomHallImage = Boolean(selectedHallImageUrl);

  const handleHallImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image size should be less than 8MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const nextUrl = String(event.target?.result || '');
      if (!nextUrl) return;
      const nextList = hallImageUrls.length
        ? hallImageUrls.map((item, idx) => (idx === selectedHallImageIndex ? nextUrl : item))
        : [nextUrl];
      const sanitizedNextList = normalizeHallImageUrls(nextList);
      setHallImageUrls(sanitizedNextList);
      void persistUiAssets({ hallImageUrls: sanitizedNextList }).catch((err: any) => {
        setError(err?.message || 'Unable to save hall images');
      });
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleAddMoreHallImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (hallImageUrls.length >= 12) {
      setError('Maximum 12 photos allowed');
      return;
    }
    if (hallImageUrls.length + files.length > 12) {
      setError('You can add up to 12 photos only');
      return;
    }
    if (files.some((file) => !file.type.startsWith('image/'))) {
      setError('Please select valid image files only');
      return;
    }
    if (files.some((file) => file.size > 8 * 1024 * 1024)) {
      setError('Each image should be less than 8MB');
      return;
    }

    const encoded = await Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(String(event.target?.result || ''));
            reader.readAsDataURL(file);
          })
      )
    );
    const next = [...hallImageUrls, ...encoded.filter(Boolean)].slice(0, 12);
    const sanitizedNext = normalizeHallImageUrls(next);
    setHallImageUrls(sanitizedNext);
    void persistUiAssets({ hallImageUrls: sanitizedNext }).catch((err: any) => {
      setError(err?.message || 'Unable to save hall images');
    });
    setSelectedHallImageIndex(Math.max(sanitizedNext.length - 1, 0));
    setError('');
  };

  const removeSelectedHallPhoto = () => {
    if (!hallImageUrls.length) return;
    const next = normalizeHallImageUrls(hallImageUrls.filter((_, idx) => idx !== selectedHallImageIndex));
    setHallImageUrls(next);
    setSelectedHallImageIndex((prev) => Math.max(0, Math.min(prev, next.length - 1)));
    void persistUiAssets({ hallImageUrls: next }).catch((err: any) => {
      setError(err?.message || 'Unable to save hall images');
    });
  };

  const getRecordPurposeLabel = (record: BookingRecord) => {
    if (record.bookingPurpose === 'other') return record.bookingPurposeOther || 'Other';
    const legacyPurpose = String((record as any)?.purpose || '').trim();
    if (legacyPurpose) return legacyPurpose;
    return record.bookingPurpose || 'Function';
  };

  const getRecordDateLabels = (record: BookingRecord) => {
    const checkinDate = new Date(record.checkinDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const checkoutDate = new Date(record.checkoutDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    return { checkinDate, checkoutDate };
  };

  const getRecordAmounts = (record: BookingRecord) => {
    const finalAmount = Number(record.finalAmount ?? record.totalAmount ?? 0);
    const paidAmount = Number(record.paymentAmount ?? 0);
    const pendingAmount = Math.max(finalAmount - paidAmount, 0);
    return { finalAmount, paidAmount, pendingAmount };
  };

  const getCustomerPhoneForWhatsapp = (record: BookingRecord): string | null => {
    const digits = String(record.mobile || '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  const openCustomerWhatsappMessage = (record: BookingRecord, message: string) => {
    const phone = getCustomerPhoneForWhatsapp(record);
    if (!phone) {
      setError('Valid mobile number not available for this booking');
      return;
    }
    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const buildPendingPaymentApprovedMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    const { finalAmount, paidAmount, pendingAmount } = getRecordAmounts(record);
    return `Dear ${record.name},\n\n` +
      `Your pending payment has been successfully received and approved by the admin.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n` +
      `Purpose: ${getRecordPurposeLabel(record)}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `Final Amount: Rs ${finalAmount.toLocaleString()}\n` +
      `Paid Amount: Rs ${paidAmount.toLocaleString()}\n` +
      `Pending Amount: Rs ${pendingAmount.toLocaleString()}\n\n` +
      `Thank you for completing the payment. Your booking is now fully confirmed.`;
  };

  const buildPendingPaymentReminderMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    const { finalAmount, paidAmount, pendingAmount } = getRecordAmounts(record);
    return `Dear ${record.name},\n\n` +
      `This is a reminder that your booking payment is still pending. Kindly complete the payment to confirm your booking.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n` +
      `Purpose: ${getRecordPurposeLabel(record)}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `Final Amount: Rs ${finalAmount.toLocaleString()}\n` +
      `Paid Amount: Rs ${paidAmount.toLocaleString()}\n` +
      `Pending Amount: Rs ${pendingAmount.toLocaleString()}\n\n` +
      `Please complete the remaining payment at the earliest to avoid cancellation.`;
  };

  const buildPartialPaymentReceivedMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    const { finalAmount, paidAmount, pendingAmount } = getRecordAmounts(record);
    return `Dear ${record.name},\n\n` +
      `Your partial payment has been successfully received. The remaining amount is still pending.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n` +
      `Purpose: ${getRecordPurposeLabel(record)}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `Final Amount: Rs ${finalAmount.toLocaleString()}\n` +
      `Paid Amount: Rs ${paidAmount.toLocaleString()}\n` +
      `Pending Amount: Rs ${pendingAmount.toLocaleString()}\n\n` +
      `Kindly complete the remaining payment to confirm your booking.`;
  };

  const buildPaymentRejectedMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    const { finalAmount } = getRecordAmounts(record);
    return `Dear ${record.name},\n\n` +
      `Your payment could not be approved by the admin. Please review the payment details or contact the admin for assistance.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n` +
      `Purpose: ${getRecordPurposeLabel(record)}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `Final Amount: Rs ${finalAmount.toLocaleString()}\n\n` +
      `Please complete the payment again to confirm your booking.`;
  };

  const buildBookingConfirmationMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    const { finalAmount } = getRecordAmounts(record);
    return `Dear ${record.name},\n\n` +
      `Your booking request has been successfully submitted and is currently under review by the admin.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n` +
      `Purpose: ${getRecordPurposeLabel(record)}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `Final Amount: Rs ${finalAmount.toLocaleString()}\n\n` +
      `You will receive a notification once the admin approves your booking.`;
  };

  const buildBookingApprovedMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    const { finalAmount } = getRecordAmounts(record);
    return `Dear ${record.name},\n\n` +
      `Your booking has been approved by the admin.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n` +
      `Purpose: ${getRecordPurposeLabel(record)}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `Final Amount: Rs ${finalAmount.toLocaleString()}\n\n` +
      `Please complete the payment to confirm your booking.`;
  };

  const buildBookingCancelledMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    return `Dear ${record.name},\n\n` +
      `Your booking has been cancelled.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `If you believe this was done in error, please contact the admin.`;
  };

  const buildEventReminderMessage = (record: BookingRecord) => {
    const { checkinDate, checkoutDate } = getRecordDateLabels(record);
    return `Dear ${record.name},\n\n` +
      `This is a friendly reminder about your upcoming booking.\n\n` +
      `Booking Details\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Purpose: ${getRecordPurposeLabel(record)}\n\n` +
      `Check-in: ${checkinDate}\n` +
      `Check-out: ${checkoutDate}\n\n` +
      `Please make sure to arrive on time and carry your booking confirmation if required.\n\n` +
      `We look forward to serving you.`;
  };

  const buildPaymentReceiptMessage = (record: BookingRecord) => {
    const { finalAmount, paidAmount } = getRecordAmounts(record);
    return `Dear ${record.name},\n\n` +
      `Your payment has been successfully received.\n\n` +
      `Payment Receipt\n\n` +
      `${record.bookingCode ? `Allotment No.: ${record.bookingCode}\n` : ''}` +
      `Name: ${record.name}\n` +
      `Mobile: ${record.mobile}\n\n` +
      `Final Amount: Rs ${finalAmount.toLocaleString()}\n` +
      `Paid Amount: Rs ${paidAmount.toLocaleString()}\n` +
      `Payment Status: Completed\n\n` +
      `Thank you for your payment. Your booking is confirmed.`;
  };

  const buildCustomerNotificationMessage = (record: BookingRecord, template: CustomerNotificationTemplate) => {
    switch (template) {
      case 'pending-payment-approved':
        return buildPendingPaymentApprovedMessage(record);
      case 'pending-payment-reminder':
        return buildPendingPaymentReminderMessage(record);
      case 'partial-payment-received':
        return buildPartialPaymentReceivedMessage(record);
      case 'payment-rejected':
        return buildPaymentRejectedMessage(record);
      case 'booking-confirmation':
        return buildBookingConfirmationMessage(record);
      case 'booking-approved':
        return buildBookingApprovedMessage(record);
      case 'booking-cancelled':
        return buildBookingCancelledMessage(record);
      case 'event-reminder':
        return buildEventReminderMessage(record);
      case 'payment-receipt':
        return buildPaymentReceiptMessage(record);
      default:
        return buildPendingPaymentReminderMessage(record);
    }
  };

  const getDefaultNotificationTemplate = (record: BookingRecord, adminRejected: boolean): CustomerNotificationTemplate => {
    const { paidAmount, pendingAmount } = getRecordAmounts(record);
    if (adminRejected) return 'payment-rejected';
    if (pendingAmount <= 0 && paidAmount > 0) return 'payment-receipt';
    if (pendingAmount > 0 && paidAmount > 0) return 'partial-payment-received';
    return 'pending-payment-reminder';
  };

  const sendCustomerNotificationWhatsapp = (record: BookingRecord, template: CustomerNotificationTemplate) => {
    const message = buildCustomerNotificationMessage(record, template);
    openCustomerWhatsappMessage(record, message);
  };

  const buildCustomerBookingWhatsappMessage = (record: BookingRecord) => {
    const { pendingAmount } = getRecordAmounts(record);

    if (pendingAmount <= 0) {
      return buildPendingPaymentApprovedMessage(record);
    }

    return buildPartialPaymentReceivedMessage(record);
  };

  const sendCustomerBookingWhatsapp = (record: BookingRecord) => {
    openCustomerWhatsappMessage(record, buildCustomerBookingWhatsappMessage(record));
  };

  const notifyAdminForBooking = (record: BookingRecord) => {
    const adminWhatsApp = ADMIN_CONTACT_PHONE || '8709276546';
    const checkinDate = new Date(record.checkinDate).toLocaleDateString('en-IN');
    const checkoutDate = new Date(record.checkoutDate).toLocaleDateString('en-IN');
    const finalAmount = Number(record.finalAmount ?? record.totalAmount ?? 0);
    const paidAmount = Number(record.paymentAmount ?? 0);
    const pendingAmount = Math.max(finalAmount - paidAmount, 0);
    const message = `*Admin Booking Alert*\n\n` +
      `${record.bookingCode ? `*Allotment No.:* ${record.bookingCode}\n` : ''}` +
      `*Name:* ${record.name}\n` +
      `*Mobile:* ${record.mobile}\n` +
      `*Purpose:* ${getRecordPurposeLabel(record)}\n` +
      `*Check-in:* ${checkinDate}\n` +
      `*Check-out:* ${checkoutDate}\n` +
      `*Final:* Rs ${finalAmount}\n` +
      `*Paid:* Rs ${paidAmount}\n` +
      `*Pending:* Rs ${pendingAmount}`;
    const adminWhatsappUrl = `https://wa.me/91${adminWhatsApp}?text=${encodeURIComponent(message)}`;
    window.open(adminWhatsappUrl, '_blank');
  };

  const sendOfferMessageToWhatsapp = () => {
    if (!selectedOfferBooking) {
      setError('Please select an upcoming booking first');
      return;
    }
    if (selectedOfferAdminRejected) {
      setError('Payment is rejected by admin. Approve payment first before sending WhatsApp.');
      return;
    }
    if (!selectedOfferAdminApproved) {
      setError('Admin approval pending. Please click Money Received in Booking Details before sending WhatsApp.');
      return;
    }
    const digits = String(selectedOfferBooking.mobile || '').replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Valid mobile number not available for this booking');
      return;
    }
    const phone = digits.length > 10 ? digits.slice(-10) : digits;
    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(renderedOfferMessage)}`;
    window.open(whatsappUrl, '_blank');
  };

  const applyApprovalStateToRecord = (bookingId: string, approval: PaymentApprovalState) => {
    setRecords((prev) =>
      prev.map((row) =>
        row._id === bookingId
          ? {
              ...row,
              userPaymentMarked: approval.userMarked,
              adminPaymentApproved: approval.adminApproved,
              adminPaymentRejected: Boolean(approval.adminRejected),
              paymentRejectionReason: approval.rejectionReason || '',
              paymentApprovedAt: approval.approvedAt
            }
          : row
      )
    );
  };

  const approveUserPayment = async (record: BookingRecord) => {
    if (!record?._id) return;
    try {
      setError('');
      const approval = await submitPaymentApprovalDecision(record._id, 'approve', adminToken);
      applyApprovalStateToRecord(record._id, approval);
      if (approval.adminApproved) {
        sendCustomerBookingWhatsapp(record);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to approve payment');
    }
  };

  const rejectUserPayment = async (record: BookingRecord) => {
    if (!record?._id) return;
    try {
      setError('');
      const approval = await submitPaymentApprovalDecision(
        record._id,
        'reject',
        adminToken,
        'money not received'
      );
      applyApprovalStateToRecord(record._id, approval);
    } catch (err: any) {
      setError(err?.message || 'Unable to reject payment');
    }
  };

  const handleAdminLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid logo image');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Logo image size should be less than 8MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = String(event.target?.result || '');
      if (!result) return;
      setAdminLogoUrl(result);
      void persistUiAssets({ adminLogoUrl: result }).catch((err: any) => {
        setError(err?.message || 'Unable to save logo');
      });
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const clearAdminLogo = () => {
    setAdminLogoUrl('');
    void persistUiAssets({ adminLogoUrl: '' }).catch((err: any) => {
      setError(err?.message || 'Unable to clear logo');
    });
  };


  const createAdminNoPaymentBooking = async () => {
    if (!adminBookingForm.name.trim()) {
      setError('Please enter customer name for admin booking');
      return;
    }
    if (adminBookingForm.mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!adminBookingForm.checkinDate || !adminBookingForm.checkoutDate) {
      setError('Please select check-in and check-out dates');
      return;
    }
    if (adminBookingForm.bookingPurpose === 'other' && !adminBookingForm.bookingPurposeOther.trim()) {
      setError('Please enter booking purpose details');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await apiFetch('/bookings/admin-no-payment', {
        method: 'POST',
        headers: withAdminAuth(adminToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(adminBookingForm)
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        handleUnauthorizedAdminResponse(
          response,
          result?.error || result?.message || 'Unable to create admin booking'
        );
      }

      setAdminBookingForm({
        name: '',
        mobile: '',
        checkinDate: '',
        checkoutDate: '',
        bookingPurpose: 'meeting',
        bookingPurposeOther: ''
      });
      await loadRecords();
      alert('Admin booking created without payment');
    } catch (err: any) {
      setError(err?.message || 'Unable to create admin booking');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (record: BookingRecord) => {
    setEditingId(record._id);
    setEditForm({
      name: record.name,
      mobile: record.mobile,
      bookingPurpose: (record.bookingPurpose || 'function') as 'meeting' | 'camp' | 'picnic' | 'function' | 'program' | 'other',
      bookingPurposeOther: record.bookingPurposeOther || '',
      checkinDate: new Date(record.checkinDate).toISOString().split('T')[0],
      checkoutDate: new Date(record.checkoutDate).toISOString().split('T')[0],
      paymentAmount: record.paymentAmount,
      paymentType: record.paymentType,
      totalAmount: record.totalAmount,
      discountType: record.discountType || 'none',
      discountValue: Number(record.discountValue || 0)
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const getComputedDiscount = () => {
    const total = Number(editForm.totalAmount) || 0;
    const value = Number(editForm.discountValue) || 0;
    if (editForm.discountType === 'percentage') {
      return Math.min((total * value) / 100, total);
    }
    if (editForm.discountType === 'flat') {
      return Math.min(value, total);
    }
    return 0;
  };

  const getComputedFinalAmount = () => {
    const total = Number(editForm.totalAmount) || 0;
    return Math.max(total - getComputedDiscount(), 0);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(`/bookings/${editingId}`, {
        method: 'PUT',
        headers: withAdminAuth(adminToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(editForm)
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        handleUnauthorizedAdminResponse(
          response,
          result?.error || result?.message || 'Unable to update booking'
        );
      }
      setEditingId(null);
      await loadRecords();
    } catch (err: any) {
      setError(err?.message || 'Unable to update booking');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (bookingId: string, bookingName: string) => {
    setPendingDelete({ id: bookingId, name: bookingName });
    setDeleteReason('');
    setDeleteCustomReason('');
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteReason('');
    setDeleteCustomReason('');
  };

  const confirmDeleteBooking = async () => {
    if (!pendingDelete) return;
    if (!deleteReason) {
      setError('Please select a delete reason');
      return;
    }
    if (deleteReason === 'Other' && !deleteCustomReason.trim()) {
      setError('Please enter custom delete reason');
      return;
    }

    setDeleting(true);
    setError('');
    try {
      const payload = {
        reason: deleteReason,
        customReason: deleteReason === 'Other' ? deleteCustomReason.trim() : ''
      };

      // Prefer POST endpoint so reason can be sent reliably.
      let response = await apiFetch(`/bookings/${pendingDelete.id}/delete`, {
        method: 'POST',
        headers: withAdminAuth(adminToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      // Fallback to DELETE if POST route is unavailable.
      if (response.status === 404 || response.status === 405) {
        const query = new URLSearchParams({ reason: payload.reason }).toString();
        response = await apiFetch(`/bookings/${pendingDelete.id}?${query}`, {
          method: 'DELETE',
          headers: withAdminAuth(adminToken, { 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });
      }

      const result = await parseJsonSafe(response);
      if (!response.ok) {
        handleUnauthorizedAdminResponse(
          response,
          result?.error || result?.message || 'Unable to delete booking'
        );
      }

      if (editingId === pendingDelete.id) {
        setEditingId(null);
      }
      closeDeleteDialog();
      await loadRecords();
    } catch (err: any) {
      setError(err?.message || 'Unable to delete booking');
    } finally {
      setDeleting(false);
    }
  };

  const bookedByDate: Record<string, string[]> = {};
  const bookedPaymentStateByDate: Record<string, 'booked' | 'full-paid'> = {};
  const bookedPendingByDate: Record<string, number> = {};
  records.forEach((record) => {
    if (record.status === 'canceled') return;
    const checkin = new Date(record.checkinDate);
    const checkout = new Date(record.checkoutDate);
    if (Number.isNaN(checkin.getTime())) return;
    const targetTotal = Number(record.finalAmount ?? record.totalAmount);
    const paidAmount = Number(record.paymentAmount || 0);
    const pendingAmount = Math.max(targetTotal - paidAmount, 0);
    const isFullPaid = paidAmount >= targetTotal;
    const cursor = new Date(checkin);

    while (cursor < checkout) {
      const dateKey = cursor.toISOString().split('T')[0];
      if (!bookedByDate[dateKey]) {
        bookedByDate[dateKey] = [];
      }
      if (!bookedPendingByDate[dateKey]) {
        bookedPendingByDate[dateKey] = 0;
      }
      if (!bookedByDate[dateKey].includes(record.name)) {
        bookedByDate[dateKey].push(record.name);
      }
      bookedPendingByDate[dateKey] += pendingAmount;
      if (!bookedPaymentStateByDate[dateKey] || isFullPaid) {
        bookedPaymentStateByDate[dateKey] = isFullPaid ? 'full-paid' : 'booked';
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  const monthYearTitle = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const lastDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const prefix = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const calendarCells: React.ReactNode[] = [];
  for (let i = 0; i < prefix; i++) {
    calendarCells.push(<div key={`blank-${i}`} />);
  }
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const dateKey = date.toISOString().split('T')[0];
    const names = bookedByDate[dateKey] || [];
    const pendingByDate = bookedPendingByDate[dateKey] || 0;
    const paymentState = bookedPaymentStateByDate[dateKey];
    const isBooked = names.length > 0;
    const isFullPaid = paymentState === 'full-paid';
    calendarCells.push(
      <div
        key={dateKey}
        className={`calendar-day-card admin-day-card ${isBooked ? 'is-booked' : 'is-available'}`}
        style={{
          minHeight: '84px',
          border: isBooked ? '2px solid #16a34a' : '1px solid #fecaca',
          borderRadius: '8px',
          padding: '6px',
          background: isBooked ? (isFullPaid ? '#16a34a' : '#ffffff') : '#fee2e2'
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px', color: isFullPaid ? '#ffffff' : '#333' }}>{day}</div>
        {isBooked ? (
          <>
            <div className="calendar-day-sub" style={{ fontSize: '0.72rem', color: isFullPaid ? '#ffffff' : '#166534', lineHeight: 1.3 }}>
              {names.join(', ')}
            </div>
            <div className="calendar-day-meta" style={{ fontSize: '0.7rem', color: isFullPaid ? '#ffffff' : '#b45309', lineHeight: 1.3, marginTop: '4px', fontWeight: 700 }}>
              Pending: Rs {pendingByDate}
            </div>
          </>
        ) : (
          <div className="calendar-day-sub" style={{ fontSize: '0.72rem', color: '#b91c1c' }}>Available</div>
        )}
      </div>
    );
  }

  const confirmedCount = records.filter((r) => r.status === 'confirmed').length;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const activeRecords = records.filter((r) => r.status !== 'canceled');
  const pastRecords = activeRecords
    .filter((r) => new Date(r.checkoutDate) < todayStart)
    .sort((a, b) => new Date(b.checkinDate).getTime() - new Date(a.checkinDate).getTime());
  const upcomingRecords = activeRecords
    .filter((r) => new Date(r.checkoutDate) >= todayStart)
    .sort((a, b) => new Date(a.checkinDate).getTime() - new Date(b.checkinDate).getTime());
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [activeAdminSettingsSection, setActiveAdminSettingsSection] = useState<null | 'management' | 'image-logo' | 'complain-feedback'>(null);
  const adminSettingsMenuRef = React.useRef<HTMLDivElement | null>(null);
  const dashboardTopRef = React.useRef<HTMLDivElement | null>(null);
  const bookingDetailsRef = React.useRef<HTMLDivElement | null>(null);
  const quickBookingRef = React.useRef<HTMLDivElement | null>(null);
  const offerComplainFeedbackRef = React.useRef<HTMLDivElement | null>(null);
  const managementImageHistoryRef = React.useRef<HTMLDivElement | null>(null);
  const imageLogoRef = React.useRef<HTMLDivElement | null>(null);
  const complainFeedbackRef = React.useRef<HTMLDivElement | null>(null);
  const totalBookingRef = React.useRef<HTMLDivElement | null>(null);

  const openAdminSettingsSection = (section: 'management' | 'image-logo' | 'complain-feedback') => {
    setIsAdminSettingsOpen(false);
    setActiveAdminSettingsSection(section);
    const sectionRef =
      section === 'management'
        ? managementImageHistoryRef
        : section === 'image-logo'
          ? imageLogoRef
          : complainFeedbackRef;

    window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const closeAdminSettingsSection = () => {
    setActiveAdminSettingsSection(null);
  };

  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!adminSettingsMenuRef.current) return;
      if (!adminSettingsMenuRef.current.contains(event.target as Node)) {
        setIsAdminSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="page-frame admin-page" style={{ minHeight: '100vh', padding: '20px' }}>
      <div className="admin-dashboard-wrap" style={{ maxWidth: '1180px', margin: '0 auto' }} ref={dashboardTopRef}>
        <div className="admin-hero-panel admin-navbar" style={{
          background: 'rgba(255,255,255,0.95)',
          color: '#0f172a',
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '16px',
          border: '1px solid rgba(191, 219, 254, 0.6)',
          boxShadow: '0 12px 24px rgba(2, 6, 23, 0.14)',
          order: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {adminLogoUrl ? (
                <img
                  src={adminLogoUrl}
                  alt="Organization logo"
                  style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid #cbd5e1', objectFit: 'cover', background: '#fff', flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px dashed #94a3b8', background: '#f8fafc', flexShrink: 0 }} title="Logo space" />
              )}
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Jharkhand Chhatriya Sangh</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={onBackToBooking} style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>Home</button>
              <div ref={adminSettingsMenuRef} className="settings-wrap" style={{ position: 'relative' }}>
                <button
                  type="button"
                  aria-label="Admin Settings"
                  onClick={() => setIsAdminSettingsOpen((prev) => !prev)}
                  className="settings-btn"
                  style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', fontWeight: 700, width: 'auto', height: 'auto' }}
                >
                  Settings
                </button>
                {isAdminSettingsOpen && (
                  <div
                    className="settings-menu"
                    style={{
                      position: 'absolute',
                      top: '44px',
                      right: 0,
                      minWidth: '210px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      boxShadow: '0 12px 28px rgba(2, 6, 23, 0.18)',
                      padding: '6px',
                      zIndex: 60
                    }}
                  >
                    <button
                      type="button"
                      className="settings-menu-item"
                      onClick={() => openAdminSettingsSection('management')}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', color: '#0f172a', fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                      Management
                    </button>
                    <button
                      type="button"
                      className="settings-menu-item"
                      onClick={() => openAdminSettingsSection('image-logo')}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', color: '#0f172a', fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                      Add Image and Logo
                    </button>
                    <button
                      type="button"
                      className="settings-menu-item"
                      onClick={() => openAdminSettingsSection('complain-feedback')}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', color: '#0f172a', fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                      Complain and Feedback
                    </button>
                  </div>
                )}
              </div>
              <button onClick={onLogout} style={{ border: '1px solid #fecaca', background: '#fee2e2', color: '#991b1b', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>Logout</button>
            </div>
          </div>
          <div className="admin-upcoming-ticker">
            <div className="admin-upcoming-ticker-track">{upcomingTickerText}</div>
          </div>
        </div>

        <div style={{ marginBottom: '12px', borderRadius: '12px', border: '1px solid #fde68a', background: '#fffbeb', padding: '10px 12px', color: '#92400e', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <span>
            {pendingApprovalCount
              ? `Notification: amount of Rs ${latestPendingRequestAmount} was created${latestPendingRequestDetails}`
              : 'Notification: no payment request created'}
          </span>
          {pendingApprovalRecords.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => {
                  void approveUserPayment(pendingApprovalRecords[0]);
                }}
                style={{ border: 'none', borderRadius: '8px', padding: '7px 10px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Approve Payment
              </button>
              <button
                onClick={() => {
                  void rejectUserPayment(pendingApprovalRecords[0]);
                }}
                style={{ border: 'none', borderRadius: '8px', padding: '7px 10px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Reject Payment
              </button>
            </div>
          )}
        </div>

        {!activeAdminSettingsSection && (
          <div style={{ marginBottom: '12px', borderRadius: '10px', border: '1px solid #c7d2fe', background: '#eef2ff', padding: '9px 12px', color: '#3730a3', fontWeight: 600 }}>
            Open <strong>Settings</strong> to manage: <strong>Management</strong>, <strong>Add Image and Logo</strong>, and <strong>Complain and Feedback</strong>.
          </div>
        )}

        <h3 style={{ margin: '0 0 8px 0', color: '#e2e8f0', order: 3 }}>TOTAL BOOKING</h3>
        <div className="admin-kpi-grid" ref={totalBookingRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px', order: 4 }}>
          <div className="admin-kpi-card">
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Total Bookings</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{records.length}</div>
          </div>
          <div className="admin-kpi-card admin-kpi-accent">
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Confirmed</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{confirmedCount}</div>
          </div>
          <div className="admin-kpi-card admin-kpi-actions">
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Actions</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              <button
                onClick={() => {
                  void loadRecords();
                }}
                title="Refresh"
                aria-label="Refresh"
                style={{ border: '1px solid #dbe2ff', background: '#ffffff', color: '#1f2937', borderRadius: '8px', width: '34px', height: '34px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={exportExcel}
                title="Export"
                aria-label="Export"
                style={{ border: '1px solid #dbe2ff', background: '#ffffff', color: '#1f2937', borderRadius: '8px', width: '34px', height: '34px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <label
                title="Import"
                aria-label="Import"
                style={{ border: '1px solid #dbe2ff', background: '#ffffff', color: '#1f2937', borderRadius: '8px', width: '34px', height: '34px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M8 13l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 5h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      importExcel(file);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </label>
              <button
                onClick={shareBookings}
                title="Share"
                aria-label="Share"
                style={{ border: '1px solid #dbe2ff', background: '#ffffff', color: '#1f2937', borderRadius: '8px', width: '34px', height: '34px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M12 16V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {activeAdminSettingsSection === 'management' && (
        <div className="admin-card" ref={managementImageHistoryRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
            <h3 style={{ marginTop: 0, marginBottom: 0, color: '#0f172a' }}>MANAGEMENT</h3>
            <button
              type="button"
              onClick={closeAdminSettingsSection}
              style={{ border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
            >
              Close
            </button>
          </div>
          <div className="admin-management-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
            <div className="admin-subcard" style={{ border: '1px solid #dbeafe', borderRadius: '12px', padding: '10px', background: '#f8fbff' }}>
              <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '8px' }}>Contact</div>
              <div style={{ display: 'grid', gap: '8px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                {contactList.map((entry, idx) => (
                  <div key={`contact-${idx}`} style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '10px', padding: '8px' }}>
                    <input
                      type="text"
                      value={entry.name}
                      onChange={(e) =>
                        setContactList((prev) => prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item)))
                      }
                      placeholder="Contact Name"
                      style={{ width: '100%', marginBottom: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                    <input
                      type="text"
                      value={entry.profileType}
                      onChange={(e) =>
                        setContactList((prev) => prev.map((item, i) => (i === idx ? { ...item, profileType: e.target.value } : item)))
                      }
                      placeholder="Profile Type"
                      style={{ width: '100%', marginBottom: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={entry.contact}
                        onChange={(e) =>
                          setContactList((prev) => prev.map((item, i) => (i === idx ? { ...item, contact: e.target.value } : item)))
                        }
                        placeholder="Contact Number / Email"
                        style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setContactList((prev) => {
                            if (prev.length <= 1) return [{ name: '', profileType: '', contact: '' }];
                            return prev.filter((_, i) => i !== idx);
                          })
                        }
                        style={{ border: 'none', borderRadius: '8px', padding: '8px 10px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const hasIncomplete = contactList.some(
                    (item) => !item.name.trim() || !item.profileType.trim() || !item.contact.trim()
                  );
                  if (hasIncomplete) {
                    setError('Please fill all contact details before adding a new contact');
                    return;
                  }
                  setError('');
                  setContactList((prev) => [...prev, { name: '', profileType: '', contact: '' }].slice(0, 20));
                }}
                style={{ marginTop: '8px', border: 'none', borderRadius: '8px', padding: '8px 10px', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Add Contact
              </button>
            </div>

            <div className="admin-subcard" style={{ border: '1px solid #dbeafe', borderRadius: '12px', padding: '10px', background: '#f8fbff' }}>
              <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '8px' }}>Contact Service Provider</div>
              <div style={{ display: 'grid', gap: '8px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                {serviceProviderList.map((entry, idx) => (
                  <div key={`service-provider-${idx}`} style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '10px', padding: '8px' }}>
                    <input
                      type="text"
                      value={entry.name}
                      onChange={(e) =>
                        setServiceProviderList((prev) => prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item)))
                      }
                      placeholder="Provider Name"
                      style={{ width: '100%', marginBottom: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                    <input
                      type="text"
                      value={entry.profileType}
                      onChange={(e) =>
                        setServiceProviderList((prev) => prev.map((item, i) => (i === idx ? { ...item, profileType: e.target.value } : item)))
                      }
                      placeholder="Profile Type"
                      style={{ width: '100%', marginBottom: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={entry.contact}
                        onChange={(e) =>
                          setServiceProviderList((prev) => prev.map((item, i) => (i === idx ? { ...item, contact: e.target.value } : item)))
                        }
                        placeholder="Contact Number / Email"
                        style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setServiceProviderList((prev) => {
                            if (prev.length <= 1) return [{ name: '', profileType: '', contact: '' }];
                            return prev.filter((_, i) => i !== idx);
                          })
                        }
                        style={{ border: 'none', borderRadius: '8px', padding: '8px 10px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const hasIncomplete = serviceProviderList.some(
                    (item) => !item.name.trim() || !item.profileType.trim() || !item.contact.trim()
                  );
                  if (hasIncomplete) {
                    setError('Please fill all service provider details before adding a new provider');
                    return;
                  }
                  setError('');
                  setServiceProviderList((prev) => [...prev, { name: '', profileType: '', contact: '' }].slice(0, 20));
                }}
                style={{ marginTop: '8px', border: 'none', borderRadius: '8px', padding: '8px 10px', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Add Provider
              </button>
            </div>

            <div className="admin-subcard" style={{ border: '1px solid #bfdbfe', borderRadius: '12px', padding: '10px', background: '#eff6ff', display: 'none' }}>
              <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '10px' }}>Records Section</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '10px', background: '#f8fbff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, color: '#1e3a8a' }}>Complain Records</div>
                    {complainList.length > 0 && (
                      <span style={{ minWidth: '20px', height: '20px', borderRadius: '999px', padding: '0 6px', background: '#dc2626', color: '#fff', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {complainList.length > 99 ? '99+' : complainList.length}
                      </span>
                    )}
                  </div>
                  {complainList.length ? (
                    <div style={{ display: 'grid', gap: '6px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                      {complainList.slice(0, 30).map((item) => {
                        const matchedBooking = item.bookingCode
                          ? records.find((record) => String(record.bookingCode || '') === String(item.bookingCode))
                          : null;
                        const guestName = matchedBooking?.name || item.name || 'Guest';
                        const guestMobile = matchedBooking?.mobile || item.mobile || 'Not available';
                        return (
                          <div key={item.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 8px', color: '#334155', fontSize: '0.86rem' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>Guest Name: {guestName}</div>
                            <div style={{ marginTop: '2px', color: '#0f172a' }}>Phone Number: {guestMobile}</div>
                            {item.bookingCode && (
                              <div style={{ marginTop: '2px', color: '#1d4ed8', fontWeight: 700, fontSize: '0.8rem' }}>
                                Allotment No.: {item.bookingCode}
                              </div>
                            )}
                            <div style={{ marginTop: '3px', color: '#dc2626', fontWeight: 700 }}>Issue : {item.message}</div>
                            <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => resolveAndWhatsappComplain(item)}
                                style={{ border: 'none', borderRadius: '7px', padding: '5px 8px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}
                              >
                                Resolve & WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => removeComplain(item.id)}
                                style={{ border: 'none', borderRadius: '7px', padding: '5px 8px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ color: '#64748b', fontSize: '0.88rem' }}>No complain records available.</div>
                  )}
                </div>

                <div style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '10px', background: '#f8fbff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, color: '#1e3a8a' }}>Feedback Records</div>
                    {feedbackList.length > 0 && (
                      <span style={{ minWidth: '20px', height: '20px', borderRadius: '999px', padding: '0 6px', background: '#dc2626', color: '#fff', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {feedbackList.length > 99 ? '99+' : feedbackList.length}
                      </span>
                    )}
                  </div>
                  {feedbackList.length ? (
                    <div style={{ display: 'grid', gap: '6px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                      {feedbackList.slice(0, 30).map((item) => (
                        <div key={item.id} style={{ position: 'relative', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 8px', color: '#334155', fontSize: '0.86rem' }}>
                          <button
                            type="button"
                            onClick={() => removeFeedback(item.id)}
                            aria-label="Delete feedback"
                            title="Delete feedback"
                            style={{ position: 'absolute', top: '3px', right: '3px', border: 'none', borderRadius: '999px', width: '22px', height: '22px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(220, 38, 38, 0.35)' }}
                          >
                            {'\u2715'}
                          </button>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>Guest Name: {item.name || 'Guest'}</div>
                          <div style={{ marginTop: '2px', color: '#0f172a' }}>Phone Number: {item.phone || 'Not available'}</div>
                          <div style={{ marginTop: '3px' }}>{item.message}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#64748b', fontSize: '0.88rem' }}>No feedback records available.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {activeAdminSettingsSection === 'image-logo' && (
        <div className="admin-card" ref={imageLogoRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
            <h3 style={{ marginTop: 0, marginBottom: 0, color: '#0f172a' }}>ADD IMAGE AND LOGO</h3>
            <button
              type="button"
              onClick={closeAdminSettingsSection}
              style={{ border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
            >
              Close
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: '12px', alignItems: 'start' }}>
            {selectedHallImageUrl ? (
              <div>
                <img
                  src={selectedHallImageUrl}
                  alt="Hall/Room"
                  style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #cbd5e1', display: 'block' }}
                />
                <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                  Current Photo: {isCustomHallImage ? 'Uploaded' : 'Not set'} ({hallImageUrls.length}/12)
                </div>
              </div>
            ) : (
              <div>
                <div style={{ width: '100%', height: '110px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 600 }}>
                  No Image
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                  Current Photo: Removed
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <label
                title="Upload Image"
                aria-label="Upload Image"
                style={{ border: 'none', borderRadius: '8px', width: '40px', height: '40px', background: '#1d4ed8', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}
              >
                {'\u2934'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleHallImageUpload} />
              </label>
              <label
                title="Add More Photos"
                aria-label="Add More Photos"
                style={{ border: 'none', borderRadius: '8px', width: '40px', height: '40px', background: '#0ea5e9', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}
              >
                {'\u002B'}
                <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleAddMoreHallImages} />
              </label>
              <label
                title="Change Image"
                aria-label="Change Image"
                style={{ border: 'none', borderRadius: '8px', width: '40px', height: '40px', background: '#0f766e', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}
              >
                {'\u270E'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleHallImageUpload} />
              </label>
              <button
                title="Clear Photos"
                aria-label="Clear Photos"
                onClick={() => {
                  setHallImageUrls([]);
                  setSelectedHallImageIndex(0);
                  void persistUiAssets({ hallImageUrls: [] }).catch((err: any) => {
                    setError(err?.message || 'Unable to clear hall photos');
                  });
                }}
                style={{ border: 'none', borderRadius: '8px', width: '40px', height: '40px', background: '#64748b', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: '1rem' }}
              >
                {'\u21BA'}
              </button>
              <button
                title="Remove Photo"
                aria-label="Remove Photo"
                onClick={removeSelectedHallPhoto}
                style={{ border: 'none', borderRadius: '8px', width: '40px', height: '40px', background: '#dc2626', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: '1rem' }}
              >
                {'\uD83D\uDDD1'}
              </button>
            </div>
          </div>
          {hallImageUrls.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              {hallImageUrls.map((img, idx) => (
                <button
                  key={`hall-thumb-${idx}`}
                  onClick={() => setSelectedHallImageIndex(idx)}
                  title={`Photo ${idx + 1}`}
                  style={{
                    border: idx === selectedHallImageIndex ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: 0,
                    width: '58px',
                    height: '46px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: '#fff'
                  }}
                >
                  <img src={img} alt={`Hall ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
            <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '8px' }}>LOGO</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {adminLogoUrl ? (
                <img
                  src={adminLogoUrl}
                  alt="Current navbar logo"
                  style={{ width: '52px', height: '52px', borderRadius: '10px', border: '1px solid #cbd5e1', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '52px', height: '52px', borderRadius: '10px', border: '1px dashed #94a3b8', background: '#f8fafc' }} />
              )}
              <label
                title="Upload Logo"
                aria-label="Upload Logo"
                style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Upload Logo
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAdminLogoUpload} />
              </label>
              <button
                type="button"
                onClick={clearAdminLogo}
                style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Remove Logo
              </button>
            </div>
          </div>
        </div>
        )}

        {error && <div style={{ color: '#b91c1c', marginBottom: '10px' }}>{error}</div>}
        {loading && <div style={{ color: '#334155', marginBottom: '10px' }}>Loading...</div>}

        <div className="admin-card" ref={offerComplainFeedbackRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 7 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>OFFER MESSAGE</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Allotment No.
              <select
                value={selectedOfferCode}
                onChange={(e) => setSelectedOfferCode(e.target.value)}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                {upcomingBookings.length ? (
                  upcomingBookings.map((row) => (
                    <option key={row._id} value={row.bookingCode || ''}>
                      {(row.bookingCode || '----')} | {new Date(row.checkinDate).toLocaleDateString('en-IN')}
                    </option>
                  ))
                ) : (
                  <option value="">No upcoming bookings</option>
                )}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Pending Amount
              <input
                value={selectedOfferBooking ? selectedOfferPendingAmount : ''}
                readOnly
                placeholder="Pending amount"
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '8px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Guest Name
              <input value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} placeholder="Guest Name" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Check-in
              <input value={offerForm.checkin} onChange={(e) => setOfferForm({ ...offerForm, checkin: e.target.value })} placeholder="Check-in" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Check-out
              <input value={offerForm.checkout} onChange={(e) => setOfferForm({ ...offerForm, checkout: e.target.value })} placeholder="Check-out" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Hall/Room Purpose
              <input value={offerForm.roomType} onChange={(e) => setOfferForm({ ...offerForm, roomType: e.target.value })} placeholder="Hall/Room Purpose" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Original Amount
              <input value={offerForm.original} onChange={(e) => setOfferForm({ ...offerForm, original: e.target.value })} placeholder="Original Amount" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Discount
              <input value={offerForm.discount} onChange={(e) => setOfferForm({ ...offerForm, discount: e.target.value })} placeholder="Discount" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Final Payable Amount
              <input value={offerForm.total} onChange={(e) => setOfferForm({ ...offerForm, total: e.target.value })} placeholder="Final Payable Amount" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Payment Status
              <input value={offerForm.paymentStatus} onChange={(e) => setOfferForm({ ...offerForm, paymentStatus: e.target.value })} placeholder="Payment Status" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </label>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', color: '#0f172a', whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
            {renderedOfferMessage || 'Select an upcoming Allotment No. to preview message.'}
          </div>
          {selectedOfferBooking && (
            <div style={{ marginBottom: '10px', fontSize: '0.86rem', color: selectedOfferAdminApproved ? '#166534' : selectedOfferAdminRejected ? '#b91c1c' : '#b45309', fontWeight: 600 }}>
              Payment Approval: {selectedOfferAdminApproved ? 'Approved' : selectedOfferAdminRejected ? 'Rejected' : (selectedOfferUserMarked ? 'Pending Admin Approval' : 'Not Requested')}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={copyOfferMessage} style={{ border: 'none', borderRadius: '8px', padding: '10px 12px', background: '#1d4ed8', color: 'white', cursor: 'pointer' }}>
              Copy Offer Message
            </button>
            <button
              onClick={sendOfferMessageToWhatsapp}
              disabled={!selectedOfferAdminApproved}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '10px 12px',
                background: selectedOfferAdminApproved ? '#16a34a' : '#94a3b8',
                color: 'white',
                cursor: selectedOfferAdminApproved ? 'pointer' : 'not-allowed',
                fontWeight: 700
              }}
            >
              Send To WhatsApp
            </button>
            <button
              onClick={() => {
                if (!selectedOfferBooking) {
                  setError('Please select an upcoming booking first');
                  return;
                }
                notifyAdminForBooking(selectedOfferBooking);
              }}
              style={{ border: 'none', borderRadius: '8px', padding: '10px 12px', background: '#ea580c', color: 'white', cursor: 'pointer', fontWeight: 700 }}
            >
              Notify Admin
            </button>
          </div>
        </div>

        <div className="admin-card" ref={quickBookingRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 1 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>QUICK BOOKING</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Header Name
              <input
                value={adminBookingForm.name}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, name: e.target.value })}
                placeholder="Header Name"
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Mobile
              <input
                value={adminBookingForm.mobile}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                placeholder="Mobile"
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Check-in Date
              <input
                type="date"
                value={adminBookingForm.checkinDate}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, checkinDate: e.target.value })}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Check-out Date
              <input
                type="date"
                value={adminBookingForm.checkoutDate}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, checkoutDate: e.target.value })}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
              Booking Purpose
              <select
                value={adminBookingForm.bookingPurpose}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, bookingPurpose: e.target.value as 'meeting' | 'camp' | 'picnic' | 'function' | 'program' | 'other' })}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                <option value="meeting">Meeting</option>
                <option value="camp">Camp</option>
                <option value="picnic">Picnic</option>
                <option value="function">Function</option>
                <option value="program">Program</option>
                <option value="other">Other</option>
              </select>
            </label>
            {adminBookingForm.bookingPurpose === 'other' && (
              <label style={{ display: 'grid', gap: '4px', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
                Purpose Details
                <input
                  value={adminBookingForm.bookingPurposeOther}
                  onChange={(e) => setAdminBookingForm({ ...adminBookingForm, bookingPurposeOther: e.target.value })}
                  placeholder="Purpose details"
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </label>
            )}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={createAdminNoPaymentBooking}
              disabled={saving}
              style={{ border: 'none', borderRadius: '8px', padding: '10px 14px', background: '#0f766e', color: 'white', cursor: 'pointer' }}
            >
              {saving ? 'Creating...' : 'create booking'}
            </button>
          </div>
        </div>

        {activeAdminSettingsSection === 'complain-feedback' && (
        <div className="admin-card" ref={complainFeedbackRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
            <h3 style={{ marginTop: 0, marginBottom: 0, color: '#0f172a' }}>COMPLAIN AND FEEDBACK</h3>
            <button
              type="button"
              onClick={closeAdminSettingsSection}
              style={{ border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
            >
              Close
            </button>
          </div>
          <div className="admin-records-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
            <div className="admin-subcard" style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '10px', background: '#f8fbff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, color: '#1e3a8a' }}>Complain Records</div>
                {complainList.length > 0 && (
                  <span style={{ minWidth: '20px', height: '20px', borderRadius: '999px', padding: '0 6px', background: '#dc2626', color: '#fff', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {complainList.length > 99 ? '99+' : complainList.length}
                  </span>
                )}
              </div>
              {complainList.length ? (
                <div style={{ display: 'grid', gap: '6px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                  {complainList.slice(0, 30).map((item) => {
                    const matchedBooking = item.bookingCode
                      ? records.find((record) => String(record.bookingCode || '') === String(item.bookingCode))
                      : null;
                    const guestName = matchedBooking?.name || item.name || 'Guest';
                    const guestMobile = matchedBooking?.mobile || item.mobile || 'Not available';
                    return (
                      <div key={item.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 8px', color: '#334155', fontSize: '0.86rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>Guest Name: {guestName}</div>
                        <div style={{ marginTop: '2px', color: '#0f172a' }}>Phone Number: {guestMobile}</div>
                        {item.bookingCode && (
                          <div style={{ marginTop: '2px', color: '#1d4ed8', fontWeight: 700, fontSize: '0.8rem' }}>
                            Allotment No.: {item.bookingCode}
                          </div>
                        )}
                        <div style={{ marginTop: '3px', color: '#dc2626', fontWeight: 700 }}>Issue : {item.message}</div>
                        <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => resolveAndWhatsappComplain(item)}
                            style={{ border: 'none', borderRadius: '7px', padding: '5px 8px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}
                          >
                            Resolve & WhatsApp
                          </button>
                          <button
                            type="button"
                            onClick={() => removeComplain(item.id)}
                            style={{ border: 'none', borderRadius: '7px', padding: '5px 8px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#64748b', fontSize: '0.88rem' }}>No complain records available.</div>
              )}
            </div>

            <div className="admin-subcard" style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '10px', background: '#f8fbff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, color: '#1e3a8a' }}>Feedback Records</div>
                {feedbackList.length > 0 && (
                  <span style={{ minWidth: '20px', height: '20px', borderRadius: '999px', padding: '0 6px', background: '#dc2626', color: '#fff', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {feedbackList.length > 99 ? '99+' : feedbackList.length}
                  </span>
                )}
              </div>
              {feedbackList.length ? (
                <div style={{ display: 'grid', gap: '6px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                  {feedbackList.slice(0, 30).map((item) => (
                    <div key={item.id} style={{ position: 'relative', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 8px', color: '#334155', fontSize: '0.86rem' }}>
                      <button
                        type="button"
                        onClick={() => removeFeedback(item.id)}
                        aria-label="Delete feedback"
                        title="Delete feedback"
                        style={{ position: 'absolute', top: '3px', right: '3px', border: 'none', borderRadius: '999px', width: '22px', height: '22px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(220, 38, 38, 0.35)' }}
                      >
                        {'\u2715'}
                      </button>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>Guest Name: {item.name || 'Guest'}</div>
                      <div style={{ marginTop: '2px', color: '#0f172a' }}>Phone Number: {item.phone || 'Not available'}</div>
                      <div style={{ marginTop: '3px' }}>{item.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#64748b', fontSize: '0.88rem' }}>No feedback records available.</div>
              )}
            </div>
          </div>
        </div>
        )}

        <div style={{ display: 'block', order: 9 }}>
          <div className="admin-card" ref={bookingDetailsRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>BOOKING DETAILS</h3>
            {editingId && (
              <div style={{
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '12px',
                background: '#f8fafc'
              }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                  Edit Booking{editingHeaderCode ? ` - Allotment No. ${editingHeaderCode}` : ''} - Name: {editingHeaderName}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Header Name" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                  <input value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="Mobile" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                  <select value={editForm.bookingPurpose} onChange={(e) => setEditForm({ ...editForm, bookingPurpose: e.target.value as 'meeting' | 'camp' | 'picnic' | 'function' | 'program' | 'other' })} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <option value="meeting">Meeting</option>
                    <option value="camp">Camp</option>
                    <option value="picnic">Picnic</option>
                    <option value="function">Function</option>
                    <option value="program">Program</option>
                    <option value="other">Other</option>
                  </select>
                  {editForm.bookingPurpose === 'other' && (
                    <input value={editForm.bookingPurposeOther} onChange={(e) => setEditForm({ ...editForm, bookingPurposeOther: e.target.value })} placeholder="Purpose details" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                  )}
                  <input type="date" value={editForm.checkinDate} onChange={(e) => setEditForm({ ...editForm, checkinDate: e.target.value })} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                  <input type="date" value={editForm.checkoutDate} onChange={(e) => setEditForm({ ...editForm, checkoutDate: e.target.value })} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                  <input type="text" inputMode="numeric" value={String(editForm.totalAmount)} onChange={(e) => setEditForm({ ...editForm, totalAmount: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} placeholder="Total Amount" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                  <input type="text" inputMode="numeric" value={String(editForm.paymentAmount)} onChange={(e) => setEditForm({ ...editForm, paymentAmount: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} placeholder="Paid Amount" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                  <select value={editForm.paymentType} onChange={(e) => setEditForm({ ...editForm, paymentType: e.target.value as 'advance' | 'full' | 'custom' })} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <option value="advance">Advance</option>
                    <option value="full">Full</option>
                    <option value="custom">Custom</option>
                  </select>
                  <select value={editForm.discountType} onChange={(e) => setEditForm({ ...editForm, discountType: e.target.value as 'none' | 'percentage' | 'flat' })} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <option value="none">No Discount</option>
                    <option value="percentage">Percentage %</option>
                    <option value="flat">Flat Amount</option>
                  </select>
                  <input type="text" inputMode="numeric" value={String(editForm.discountValue)} onChange={(e) => setEditForm({ ...editForm, discountValue: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} placeholder="Discount Value" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                </div>
                <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '10px' }}>
                  Discount: Rs {getComputedDiscount().toFixed(0)} | Final Amount: Rs {getComputedFinalAmount().toFixed(0)}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={saveEdit} disabled={saving} style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', background: '#16a34a', color: 'white', cursor: 'pointer' }}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={cancelEdit} style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', background: '#64748b', color: 'white', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div style={{ maxHeight: '560px', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ background: '#f1f5f9' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Allotment No.</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Purpose</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Mobile</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Check-in</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Check-out</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Total</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Advance Paid</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Security Deposit</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Discount</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Final</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Pending</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Payment Proof</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Payment Approval</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!records.length ? (
                    <tr>
                      <td colSpan={15} style={{ padding: '10px', color: '#64748b' }}>No records</td>
                    </tr>
                  ) : (
                    records.map((row) => (
                      <tr key={row._id}>
                        {(() => {
                          const approval = paymentApprovalByBooking[row._id];
                          const userMarked = Boolean(approval?.userMarked);
                          const adminApproved = Boolean(approval?.adminApproved);
                          const adminRejected = Boolean(approval?.adminRejected);
                          const finalAmountValue = Number(row.finalAmount ?? row.totalAmount);
                          const paidAmountValue = Number(row.paymentAmount || 0);
                          const pendingAmountValue = Math.max(finalAmountValue - paidAmountValue, 0);
                          const securityDepositValue = Math.max(
                            Number(row.securityDepositAmount ?? (row.includeSecurityDeposit ? 500 : 0)),
                            0
                          );
                          const selectedNotificationTemplate =
                            notificationTemplateById[row._id] || getDefaultNotificationTemplate(row, adminRejected);
                          return (
                            <>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#1d4ed8' }}>{row.bookingCode || '----'}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{row.name}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                          {row.bookingPurpose === 'other' ? (row.bookingPurposeOther || 'Other') : (row.bookingPurpose || 'Function')}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{row.mobile}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{new Date(row.checkinDate).toLocaleDateString('en-IN')}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{new Date(row.checkoutDate).toLocaleDateString('en-IN')}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>Rs {row.totalAmount}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#166534' }}>Rs {paidAmountValue}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: securityDepositValue > 0 ? '#166534' : '#64748b' }}>
                          Rs {securityDepositValue}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>Rs {Number(row.discountAmount || 0)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>Rs {finalAmountValue}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: pendingAmountValue > 0 ? '#b45309' : '#166534' }}>
                          Rs {pendingAmountValue}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                          {(() => {
                            const proofUrl = String(row.profilePhoto || '').trim();
                            if (!proofUrl) {
                              return <div style={{ color: '#64748b', fontSize: '0.78rem' }}>Not Uploaded</div>;
                            }
                            const isImageProof = proofUrl.startsWith('data:image') || /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(proofUrl);
                            if (isImageProof) {
                              return (
                                <a href={proofUrl} target="_blank" rel="noreferrer" title="Open Payment Proof" style={{ display: 'inline-block' }}>
                                  <img
                                    src={proofUrl}
                                    alt="Payment proof"
                                    style={{ width: '56px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'block' }}
                                  />
                                </a>
                              );
                            }
                            return (
                              <a href={proofUrl} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none' }}>
                                View Proof
                              </a>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                          {adminApproved ? (
                            <div style={{ color: '#166534', fontWeight: 700 }}>Approved</div>
                          ) : userMarked ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                onClick={() => {
                                  void approveUserPayment(row);
                                }}
                                style={{ border: 'none', borderRadius: '8px', padding: '6px 10px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                              >
                                Money Received
                              </button>
                              <button
                                onClick={() => {
                                  void rejectUserPayment(row);
                                }}
                                style={{ border: 'none', borderRadius: '8px', padding: '6px 10px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                              >
                                Reject
                              </button>
                              {adminRejected && <span style={{ color: '#b91c1c', fontWeight: 700 }}>Rejected</span>}
                            </div>
                          ) : (
                            <div style={{ color: '#64748b' }}>Not Requested</div>
                          )}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'grid', gap: '6px' }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', alignItems: 'center' }}>
                              <button
                                onClick={() => startEdit(row)}
                                title="Edit"
                                aria-label="Edit"
                                style={{ border: 'none', borderRadius: '8px', width: '32px', height: '32px', background: '#1d4ed8', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                              >
                                {'\u270E'}
                              </button>
                              <button
                                onClick={() => openDeleteDialog(row._id, row.name)}
                                title="Delete"
                                aria-label="Delete"
                                style={{ border: 'none', borderRadius: '8px', width: '32px', height: '32px', background: '#dc2626', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                              >
                                {'\uD83D\uDDD1'}
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <select
                                value={selectedNotificationTemplate}
                                onChange={(e) =>
                                  setNotificationTemplateById((prev) => ({
                                    ...prev,
                                    [row._id]: e.target.value as CustomerNotificationTemplate
                                  }))
                                }
                                style={{ minWidth: '130px', maxWidth: '160px', padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.74rem' }}
                              >
                                <option value="pending-payment-reminder">Pending Reminder</option>
                                <option value="partial-payment-received">Partial Payment</option>
                                <option value="payment-receipt">Payment Receipt</option>
                                <option value="pending-payment-approved">Pending Approved</option>
                                <option value="payment-rejected">Payment Rejected</option>
                                <option value="booking-confirmation">Booking Confirmation</option>
                                <option value="booking-approved">Booking Approved</option>
                                <option value="booking-cancelled">Booking Cancelled</option>
                                <option value="event-reminder">Event Reminder</option>
                              </select>
                              <button
                                onClick={() => sendCustomerNotificationWhatsapp(row, selectedNotificationTemplate)}
                                style={{ border: 'none', borderRadius: '8px', padding: '7px 8px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        </td>
                            </>
                          );
                        })()}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginTop: '14px' }}>
            <div className="admin-card" style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)' }}>
              <h3 style={{ marginTop: 0, color: '#0f172a' }}>HISTORY - PAST RECORDS</h3>
              {!pastRecords.length ? (
                <div style={{ color: '#64748b', fontSize: '0.9rem' }}>No past records.</div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {pastRecords.map((row) => (
                    <div key={`past-row-${row._id}`} style={{ fontSize: '0.84rem', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px' }}>
                      {row.bookingCode || '----'} | {row.name} | {new Date(row.checkinDate).toLocaleDateString('en-IN')} - {new Date(row.checkoutDate).toLocaleDateString('en-IN')}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-card" style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)' }}>
              <h3 style={{ marginTop: 0, color: '#0f172a' }}>HISTORY - UPCOMING BOOKING RECORDS</h3>
              {!upcomingRecords.length ? (
                <div style={{ color: '#64748b', fontSize: '0.9rem' }}>No upcoming records.</div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {upcomingRecords.map((row) => {
                    const finalAmount = Number(row.finalAmount ?? row.totalAmount);
                    const pendingAmount = Math.max(finalAmount - Number(row.paymentAmount || 0), 0);
                    return (
                      <div key={`upcoming-row-${row._id}`} style={{ fontSize: '0.84rem', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px' }}>
                        {row.bookingCode || '----'} | {row.name} | {new Date(row.checkinDate).toLocaleDateString('en-IN')} - {new Date(row.checkoutDate).toLocaleDateString('en-IN')} | Pending Rs {pendingAmount}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {pendingDelete && (
        <div
          onClick={closeDeleteDialog}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              borderRadius: '14px',
              background: 'white',
              padding: '16px',
              boxShadow: '0 18px 38px rgba(2, 6, 23, 0.3)'
            }}
          >
            <h4 style={{ margin: '0 0 10px 0', color: '#111827' }}>Delete Booking</h4>
            <p style={{ margin: '0 0 10px 0', color: '#4b5563', fontSize: '0.92rem' }}>
              Select reason before deleting booking for <strong>{pendingDelete.name}</strong>.
            </p>
            <select
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '8px' }}
            >
              <option value="">Select reason</option>
              <option value="Customer canceled">Customer canceled</option>
              <option value="Date moved">Date moved</option>
              <option value="Duplicate booking">Duplicate booking</option>
              <option value="Payment not completed">Payment not completed</option>
              <option value="Admin correction">Admin correction</option>
              <option value="Other">Other</option>
            </select>
            {deleteReason === 'Other' && (
              <input
                type="text"
                value={deleteCustomReason}
                onChange={(e) => setDeleteCustomReason(e.target.value)}
                placeholder="Enter custom reason"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '8px', boxSizing: 'border-box' }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button onClick={closeDeleteDialog} style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', background: '#9ca3af', color: 'white', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmDeleteBooking} disabled={deleting} style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', background: '#dc2626', color: 'white', cursor: 'pointer' }}>
                {deleting ? 'Deleting...' : 'Delete Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .compact-back-btn,
  .nav-back-btn {
    font-size: 0.92rem !important;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
`;
document.head.appendChild(style);
export default App;








