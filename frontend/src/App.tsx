import React, { useState } from 'react';

type Page = 'login' | 'booking' | 'payment' | 'approval-waiting' | 'confirmation' | 'pending-login' | 'pending-payment' | 'admin-login' | 'admin-panel';
const configuredApiBase = process.env.REACT_APP_API_BASE_URL;
const API_BASES = configuredApiBase
  ? [configuredApiBase]
  : [ 'https://scannbook.onrender.com/api' , 'http://localhost:3100/api'];
const ADMIN_USERNAME = process.env.REACT_APP_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || 'admin123';
const DEFAULT_HALL_IMAGE = '/Jharkhand_Kshatriya_Sangh.jpeg';
const DEFAULT_HALL_IMAGES = [
  DEFAULT_HALL_IMAGE,
  '/IMG_0772.jpeg',
  '/IMG_0783.jpeg',
  '/IMG_0786.jpeg',
  '/IMG_0787.jpeg',
  '/IMG_0792.jpeg',
  '/IMG_0796.jpeg',
  '/IMG_0801.jpeg',
  '/IMG_0803.jpeg',
  '/IMG_0804.jpeg'
];
const HALL_IMAGE_STORAGE_KEY = 'hallRoomImageUrl';
const HALL_IMAGE_LIST_STORAGE_KEY = 'hallRoomImageUrls';
const ADMIN_LOGO_STORAGE_KEY = 'adminPanelLogoUrl';
const PAYMENT_APPROVAL_STORAGE_KEY = 'paymentApprovalByBooking';

type PaymentApprovalState = {
  userMarked: boolean;
  adminApproved: boolean;
  adminRejected?: boolean;
  rejectionReason?: string;
  approvedAt?: string;
};

type PaymentApprovalMap = Record<string, PaymentApprovalState>;

const readPaymentApprovalMap = (): PaymentApprovalMap => {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem(PAYMENT_APPROVAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<PaymentApprovalMap>((acc, [key, value]) => {
      if (!key || !value || typeof value !== 'object') return acc;
      const entry = value as any;
      acc[key] = {
        userMarked: Boolean(entry.userMarked),
        adminApproved: Boolean(entry.adminApproved),
        adminRejected: Boolean(entry.adminRejected),
        rejectionReason: entry.rejectionReason ? String(entry.rejectionReason) : undefined,
        approvedAt: entry.approvedAt ? String(entry.approvedAt) : undefined
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const writePaymentApprovalMap = (map: PaymentApprovalMap) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PAYMENT_APPROVAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
};

const updatePaymentApproval = (bookingKey: string, updater: (current: PaymentApprovalState | undefined) => PaymentApprovalState) => {
  if (!bookingKey) return;
  const currentMap = readPaymentApprovalMap();
  currentMap[bookingKey] = updater(currentMap[bookingKey]);
  writePaymentApprovalMap(currentMap);
};

const markUserPaymentRequest = (bookingKey: string) => {
  updatePaymentApproval(bookingKey, (current) => ({
    userMarked: true,
    adminApproved: current?.adminApproved || false,
    adminRejected: false,
    rejectionReason: '',
    approvedAt: current?.approvedAt
  }));
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
  status: string;
  source: string;
  createdAt: string;
  userPaymentMarked?: boolean;
  adminPaymentApproved?: boolean;
}

interface PendingPaymentSession {
  bookingId: string;
  bookingCode: string;
  name: string;
  mobile: string;
  payableTotal: number;
  pendingAmount: number;
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [saveError, setSaveError] = useState<string>('');
  const [pendingPaymentSession, setPendingPaymentSession] = useState<PendingPaymentSession | null>(null);
  const [approvalWaitingBooking, setApprovalWaitingBooking] = useState<{ id: string; code?: string } | null>(null);
  const [approvalWaitingStatus, setApprovalWaitingStatus] = useState<PaymentApprovalState | null>(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return window.sessionStorage.getItem('adminLoggedIn') === 'true';
  });
  const [hallImageUrls, setHallImageUrls] = useState<string[]>(() => {
    try {
      const listRaw = window.localStorage.getItem(HALL_IMAGE_LIST_STORAGE_KEY);
      if (listRaw) {
        const parsed = JSON.parse(listRaw);
        if (Array.isArray(parsed) && parsed.length) {
          const stored = parsed.slice(0, 12).filter((item) => typeof item === 'string' && item.trim());
          return Array.from(new Set([...stored, ...DEFAULT_HALL_IMAGES])).slice(0, 12);
        }
      }
      const singleStored = window.localStorage.getItem(HALL_IMAGE_STORAGE_KEY);
      if (singleStored === null) return DEFAULT_HALL_IMAGES;
      if (!singleStored.trim()) return [];
      return Array.from(new Set([singleStored, ...DEFAULT_HALL_IMAGES])).slice(0, 12);
    } catch {
      return DEFAULT_HALL_IMAGES;
    }
  });
  const [bookingData, setBookingData] = useState<BookingData>({
    bookingCode: '',
    name: '',
    purpose: '',
    gender: '',
    email: '',
    mobile: '',
    checkinDate: '',
    checkoutDate: '',
    paymentAmount: 1000,
    paymentType: 'advance',
    totalAmount: 3500,
    customAmount: 1000,
    whatsappNotification: true,
    profilePhoto: null
  });

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
        markUserPaymentRequest(bookingId);
        const latestStatus = readPaymentApprovalMap()[bookingId] || null;
        setApprovalWaitingBooking({ id: bookingId, code: result?.booking?.bookingCode || bookingData.bookingCode || '' });
        setApprovalWaitingStatus(latestStatus);
        setCurrentPage('approval-waiting');
        return;
      }
      setCurrentPage('confirmation');
    } catch (error: any) {
      setSaveError(error?.message || 'Unable to save booking');
      setCurrentPage('confirmation');
    }
  };

  const refreshApprovalStatus = React.useCallback(() => {
    if (!approvalWaitingBooking?.id) return;
    const status = readPaymentApprovalMap()[approvalWaitingBooking.id] || null;
    setApprovalWaitingStatus(status);
    if (status?.adminApproved) {
      setCurrentPage('confirmation');
    }
  }, [approvalWaitingBooking?.id]);

  React.useEffect(() => {
    if (currentPage !== 'approval-waiting' || !approvalWaitingBooking?.id) return;
    refreshApprovalStatus();
    const timer = window.setInterval(refreshApprovalStatus, 2000);
    return () => window.clearInterval(timer);
  }, [currentPage, approvalWaitingBooking?.id, refreshApprovalStatus]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PAYMENT_APPROVAL_STORAGE_KEY) {
        refreshApprovalStatus();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshApprovalStatus]);

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
      body: JSON.stringify({ paymentAmount: pendingPaymentSession.pendingAmount })
    });

    const result = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(result?.error || result?.message || 'Unable to complete pending payment');
    }
    markUserPaymentRequest(String(pendingPaymentSession.bookingId || ''));
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
              alert('Pending payment completed successfully');
              setPendingPaymentSession(null);
              setCurrentPage('login');
            }}
          />
        );
      case 'booking':
        return (
          <BookingPage 
            bookingData={bookingData}
            setBookingData={setBookingData}
            onNext={() => setCurrentPage('payment')}
            onBack={() => setCurrentPage('login')}
          />
        );
      case 'payment':
        return (
          <PaymentPage 
            amount={bookingData.paymentAmount}
            onSuccess={saveBookingToMongo}
            onBack={() => setCurrentPage('booking')}
          />
        );
      case 'approval-waiting':
        return (
          <PaymentApprovalWaitingPage
            bookingCode={approvalWaitingBooking?.code || bookingData.bookingCode}
            status={approvalWaitingStatus}
            onRefresh={refreshApprovalStatus}
            onBackToPayment={() => setCurrentPage('payment')}
          />
        );
      case 'confirmation':
        return <ConfirmationPage bookingData={bookingData} saveError={saveError} onNewBooking={() => {
          setCurrentPage('login');
          setSaveError('');
          setApprovalWaitingBooking(null);
          setApprovalWaitingStatus(null);
          setBookingData({ bookingCode: '', name: '', purpose: '', gender: '', email: '', mobile: '', checkinDate: '', checkoutDate: '', paymentAmount: 1000, paymentType: 'advance', totalAmount: 3500, customAmount: 1000, whatsappNotification: true, profilePhoto: null });
        }} />;
      case 'admin-login':
        return (
          <AdminLoginPage
            onBack={() => setCurrentPage('login')}
            onLoginSuccess={() => {
              setIsAdminLoggedIn(true);
              window.sessionStorage.setItem('adminLoggedIn', 'true');
              setCurrentPage('admin-panel');
            }}
          />
        );
      case 'admin-panel':
        if (!isAdminLoggedIn) {
          return (
            <AdminLoginPage
              onBack={() => setCurrentPage('login')}
              onLoginSuccess={() => {
                setIsAdminLoggedIn(true);
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
            onLogout={() => {
              setIsAdminLoggedIn(false);
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
          onPendingPaymentLogin={() => setCurrentPage('pending-login')}
        />;
    }
  };

  const isLoginPage = currentPage === 'login';

  return (
    <div className={`app-shell ${isLoginPage ? 'login-banner-shell' : 'admin-shell'}`} style={{
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
  onPendingPaymentLogin: () => void;
}> = ({ bookingData, hallImageUrls, setBookingData, onNext, onBack, onAdminLogin, onPendingPaymentLogin }) => {
  const [isHallImageOpen, setIsHallImageOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  type SettingsTab = 'contact' | 'service' | 'booking' | 'complain' | 'feedback' | 'language' | 'theme';
  type AppLanguage = 'en' | 'hi';
  type UiTheme = 'light' | 'dark';
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
  const [selectedTheme, setSelectedTheme] = useState<UiTheme>(() => {
    try {
      const saved = window.localStorage.getItem('preferredTheme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const settingItems = ['Admin', 'Language', 'Theme', 'Contact', 'Service', 'Booking Details', 'Complain', 'Feedback'];
  const getSettingIcon = (item: string) => {
    const key = item.toLowerCase();
    const iconPathByItem: Record<string, string> = {
      admin: 'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Zm8 3.5l-1.9-.7c-.1-.4-.2-.8-.3-1.1l1-1.7l-1.8-1.8l-1.7 1c-.4-.2-.8-.3-1.1-.4L13 4h-2l-.7 1.9c-.4.1-.8.2-1.1.4l-1.7-1L5.7 7.1l1 1.7c-.2.4-.3.8-.4 1.1L4.4 11v2l1.9.7c.1.4.2.8.4 1.1l-1 1.7l1.8 1.8l1.7-1c.4.2.8.3 1.1.4l.7 1.9h2l.7-1.9c.4-.1.8-.2 1.1-.4l1.7 1l1.8-1.8l-1-1.7c.2-.4.3-.8.3-1.1L20 13v-1Z',
      language: 'M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm6.9 9h-3.1a15.8 15.8 0 0 0-1.2-5A8 8 0 0 1 18.9 11ZM12 4.1c.8 1.2 1.7 3.5 2 6.9h-4c.3-3.4 1.2-5.7 2-6.9ZM4.1 13h3.1c.2 1.8.6 3.6 1.2 5a8 8 0 0 1-4.3-5Zm3.1-2H4.1a8 8 0 0 1 4.3-5c-.6 1.4-1 3.2-1.2 5Zm4.8 8c-.8-1.2-1.7-3.5-2-6.9h4c-.3 3.4-1.2 5.7-2 6.9Zm2.4-1c.6-1.4 1-3.2 1.2-5h3.1a8 8 0 0 1-4.3 5Z',
      theme: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
      contact: 'M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3c1.2.4 2.5.6 3.8.6c.6 0 1 .4 1 1V21c0 .6-.4 1-1 1C10.6 22 2 13.4 2 2c0-.6.4-1 1-1h4.5c.6 0 1 .4 1 1c0 1.3.2 2.6.6 3.8c.1.4 0 .8-.3 1.1l-2.2 2.2Z',
      service: 'M2 19h20v2H2v-2Zm3-2h3l2-6H7l-2 6Zm7 0h3l2-10h-3l-2 10Zm7 0h3V3h-3v14Z',
      'booking details': 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 8H5v10h14V10Z',
      complain: 'M1 21h22L12 2L1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z',
      feedback: 'M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6l-4 3V5Zm3 1l7 5l7-5H5Z',
      default: 'M12 5a7 7 0 1 0 0 14a7 7 0 0 0 0-14Z'
    };
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={iconPathByItem[key] || iconPathByItem.default} />
      </svg>
    );
  };
  const languageText = {
    en: {
      back: 'Back',
      customerDetails: 'Customer Details',
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
      back: 'वापस',
      customerDetails: 'ग्राहक विवरण',
      fullName: 'पूरा नाम',
      fullNamePlaceholder: 'अपना पूरा नाम दर्ज करें',
      mobileNumber: 'मोबाइल नंबर',
      mobilePlaceholder: 'अपना 10 अंकों का मोबाइल नंबर दर्ज करें',
      purpose: 'उद्देश्य',
      selectPurpose: 'उद्देश्य चुनें',
      enterPurpose: 'उद्देश्य लिखें',
      gender: 'लिंग',
      selectGender: 'लिंग चुनें',
      male: 'पुरुष',
      female: 'महिला',
      other: 'अन्य',
      emailOptional: 'ईमेल (वैकल्पिक)',
      emailPlaceholder: 'ईमेल पता दर्ज करें',
      whatsapp: 'व्हाट्सऐप सूचनाएं',
      continueBooking: 'बुकिंग जारी रखें',
      pendingPaymentLogin: 'बकाया भुगतान लॉगिन',
      language: 'भाषा',
      close: 'बंद करें'
    }
  } as const;
  const t = languageText[selectedLanguage];
  const hallSlides = hallImageUrls.length ? hallImageUrls : DEFAULT_HALL_IMAGES;
  const [hallSlideIndex, setHallSlideIndex] = useState(0);
  const purposeOptions = ['meeting', 'camp', 'picnic', 'function', 'program'] as const;
  type PurposeOption = '' | (typeof purposeOptions)[number] | 'other';
  const initialPurpose = bookingData.purpose.trim().toLowerCase();
  const [purposeOption, setPurposeOption] = useState<PurposeOption>(() => {
    if (!initialPurpose) return '';
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
    const handleOutsideClick = (event: MouseEvent) => {
      if (!settingsMenuRef.current) return;
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem('preferredTheme', selectedTheme);
    } catch {
      // ignore storage errors
    }
    document.body.classList.toggle('theme-dark', selectedTheme === 'dark');
  }, [selectedLanguage, selectedTheme]);

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

    const tabMap: Record<string, SettingsTab> = {
      language: 'language',
      theme: 'theme',
      contact: 'contact',
      service: 'service',
      'booking details': 'booking',
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
    if (!activeSettingsTab) return;

    if (activeSettingsTab === 'contact') {
      setSettingsContacts(getStoredProfiles('adminContactList'));
      return;
    }
    if (activeSettingsTab === 'service') {
      setSettingsServiceProviders(getStoredProfiles('adminServiceProviderList'));
      return;
    }
    if (activeSettingsTab !== 'booking') return;

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

    loadBookedDates();
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
      setSettingsStatusText('Booking code is mandatory for complain');
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
            throw new Error(result?.error || result?.message || 'Unable to verify booking code');
          }
          const matched = (result?.bookings || []).find((booking: any) => String(booking?.bookingCode || '') === code);
          if (!matched) {
            setSettingsStatusText('Booking code not found. Please enter a valid booking code.');
            return;
          }
          guestName = String(matched?.name || guestName);
          guestMobile = String(matched?.mobile || guestMobile);
        } catch {
          setSettingsStatusText('Unable to verify booking code right now. Please try again.');
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
            {isBooked ? 'Already Booked' : 'Available'}
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
        <div className="card-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button
            onClick={onBack}
            className="nav-back-btn"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#667eea'
            }}
          >
            {t.back}
          </button>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div ref={settingsMenuRef} className="settings-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                aria-label="Settings"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                className="settings-btn"
                style={{
                  width: '34px',
                  height: '34px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="17" cy="6" r="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 12H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="7" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="17" cy="18" r="2" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              {isSettingsOpen && (
                <div
                  className="settings-menu"
                  style={{
                    position: 'absolute',
                    top: '42px',
                    right: 0,
                    minWidth: '170px',
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
                      <span style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span>{item}</span>
                        <span
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '999px',
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#334155',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}
                        >
                          {getSettingIcon(item)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div
            className="hall-hero-frame"
            style={{
              position: 'relative',
              width: '100%',
              minHeight: '300px',
              boxSizing: 'border-box',
              marginBottom: '15px',
              borderRadius: '16px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.55)',
              overflow: 'hidden'
            }}
          >
            {hallSlides.length ? (
              <img
                className="hall-hero-image"
                src={hallSlides[hallSlideIndex]}
                alt="Hall/Room View"
                onClick={() => setIsHallImageOpen(true)}
                style={{
                  width: '100%',
                  height: '300px',
                  objectFit: 'cover',
                  objectPosition: 'center 35%',
                  display: 'block',
                  cursor: 'zoom-in'
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e2e8f0', fontWeight: 600 }}>
                No image
              </div>
            )}
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
          
          <h2 className="form-heading" style={{ color: '#333', margin: '0 0 10px 0', fontSize: '2rem', fontWeight: '300' }}>
            {t.customerDetails}
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              color: '#333', 
              fontWeight: '500' 
            }}>
              {t.fullName}
            </label>
            <input
              type="text"
              value={bookingData.name}
              onChange={handleNameChange}
              placeholder={t.fullNamePlaceholder}
              style={{
                width: '100%',
                padding: '15px',
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                fontSize: '1rem',
                transition: 'border-color 0.3s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
              required
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              color: '#333', 
              fontWeight: '500' 
            }}>
              {t.mobileNumber}
            </label>
            <input
              type="tel"
              value={bookingData.mobile}
              onChange={handleMobileChange}
              placeholder={t.mobilePlaceholder}
              maxLength={10}
              style={{
                width: '100%',
                padding: '15px',
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                fontSize: '1rem',
                transition: 'border-color 0.3s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
              required
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#333', fontWeight: '500' }}>
              {t.purpose}
            </label>
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
              style={{
                width: '100%',
                padding: '15px',
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                fontSize: '1rem',
                transition: 'border-color 0.3s ease',
                boxSizing: 'border-box',
                background: 'white'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
              required
            >
              <option value="">{t.selectPurpose}</option>
              <option value="meeting">{selectedLanguage === 'hi' ? 'मीटिंग' : 'Meeting'}</option>
              <option value="camp">{selectedLanguage === 'hi' ? 'कैंप' : 'Camp'}</option>
              <option value="picnic">{selectedLanguage === 'hi' ? 'पिकनिक' : 'Picnic'}</option>
              <option value="function">{selectedLanguage === 'hi' ? 'फंक्शन' : 'Function'}</option>
              <option value="program">{selectedLanguage === 'hi' ? 'प्रोग्राम' : 'Program'}</option>
              <option value="other">{t.other}</option>
            </select>
            {purposeOption === 'other' && (
              <input
                type="text"
                value={customPurpose}
                onChange={(e) => {
                  setCustomPurpose(e.target.value);
                  setBookingData({ ...bookingData, purpose: e.target.value });
                }}
                placeholder={t.enterPurpose}
                style={{
                  width: '100%',
                  padding: '15px',
                  border: '2px solid #e1e8ed',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  transition: 'border-color 0.3s ease',
                  boxSizing: 'border-box',
                  marginTop: '10px'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
                required
              />
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#333', fontWeight: '500' }}>
              {t.gender}
            </label>
            <select
              value={bookingData.gender}
              onChange={(e) => setBookingData({ ...bookingData, gender: e.target.value as '' | 'male' | 'female' | 'other' })}
              style={{
                width: '100%',
                padding: '15px',
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                fontSize: '1rem',
                transition: 'border-color 0.3s ease',
                boxSizing: 'border-box',
                background: 'white'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
              required
            >
              <option value="">{t.selectGender}</option>
              <option value="male">{t.male}</option>
              <option value="female">{t.female}</option>
              <option value="other">{t.other}</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#333', fontWeight: '500' }}>
              {t.emailOptional}
            </label>
            <input
              type="email"
              value={bookingData.email}
              onChange={(e) => setBookingData({ ...bookingData, email: e.target.value })}
              placeholder={t.emailPlaceholder}
              style={{
                width: '100%',
                padding: '15px',
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                fontSize: '1rem',
                transition: 'border-color 0.3s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e1e8ed'}
            />
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '15px',
              border: '2px solid #e1e8ed',
              borderRadius: '10px',
              transition: 'border-color 0.3s ease',
              background: bookingData.whatsappNotification ? '#f0f8ff' : 'transparent'
            }}>
              <input
                type="checkbox"
                checked={bookingData.whatsappNotification}
                onChange={(e) => setBookingData({ ...bookingData, whatsappNotification: e.target.checked })}
                style={{
                  marginRight: '12px',
                  transform: 'scale(1.2)'
                }}
              />
              <div>
                <div style={{ fontWeight: '600', color: '#333', marginBottom: '4px' }}>
                  {t.whatsapp}
                </div>
              </div>
            </label>
          </div>

          <button
            className="primary-cta"
            type="submit"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '15px',
              padding: '18px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
              boxShadow: '0 5px 15px rgba(102, 126, 234, 0.3)'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {t.continueBooking}
          </button>
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
                  ? 'Booking Details'
                  : activeSettingsTab === 'language'
                    ? 'Language'
                    : activeSettingsTab === 'theme'
                      ? 'Theme'
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
                    हिन्दी
                  </button>
                </div>
              </div>
            )}

            {activeSettingsTab === 'theme' && (
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ color: '#334155', fontSize: '0.9rem' }}>Choose theme</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedTheme('light')}
                    style={{ border: selectedTheme === 'light' ? '2px solid #1d4ed8' : '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTheme('dark')}
                    style={{ border: selectedTheme === 'dark' ? '2px solid #1d4ed8' : '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Dark
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
                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#475569' }}>
                  Booking calendar shows availability only. Personal details are hidden.
                </div>
              </div>
            )}

            {(activeSettingsTab === 'complain' || activeSettingsTab === 'feedback') && (
              <div>
                {activeSettingsTab === 'complain' && (
                  <input
                    value={complainBookingCode}
                    onChange={(e) => setComplainBookingCode(e.target.value.replace(/\s+/g, '').slice(0, 20))}
                    placeholder="Booking Code (mandatory)"
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
      {isHallImageOpen && (
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
            {hallSlides.length ? (
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
            ) : (
              <div style={{ color: '#e2e8f0', padding: '30px 40px' }}>No image</div>
            )}
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
      setError('Please enter your 4-digit booking code');
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
          style={{ background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', marginBottom: '16px', color: '#334155' }}
        >
          Back
        </button>
        <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Pending Payment Login</h2>
        <p style={{ margin: '0 0 20px 0', color: '#475569' }}>Login with your 4-digit allotment code and mobile number.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#0f172a', fontWeight: 600 }}>Booking Code (4 digits)</label>
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
          <button onClick={onBack} style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer' }}>
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
          style={{ background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', marginBottom: '16px', color: '#334155' }}
        >
          Back
        </button>
        <h2 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Pending Payment</h2>
        <p style={{ margin: '0 0 20px 0', color: '#475569' }}>Complete your remaining payment using your booking login.</p>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ marginBottom: '8px', color: '#0f172a' }}><strong>Name:</strong> {session.name}</div>
          <div style={{ marginBottom: '8px', color: '#0f172a' }}><strong>Code:</strong> {session.bookingCode}</div>
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
          {processing ? 'Processing Payment...' : `Pay Rs ${session.pendingAmount} and Confirm`}
        </button>
      </div>
    </div>
  );
};

// Booking Page
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

  const getRangeDates = (startDate: string, endDate: string) => {
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current < end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const isCheckoutDateAllowed = (checkinDate: string, checkoutDate: string) => {
    if (!checkinDate || !checkoutDate) return false;
    if (checkoutDate <= checkinDate) return false;

    // Professional hotel-style rule:
    // the stay occupies nights from check-in up to (but not including) checkout.
    // So checkout day itself can be another guest's check-in day.
    const stayNights = getRangeDates(checkinDate, checkoutDate);
    return !stayNights.some((date) => isDateBooked(date));
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

      const selectedRangeDates = getRangeDates(bookingData.checkinDate, bookingData.checkoutDate);
      const hasBookedDate = selectedRangeDates.some((date) => isDateBooked(date));
      if (hasBookedDate) {
        alert('Selected date is already booked. Please choose another date.');
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

      cells.push(
        <div
          key={dateKey}
          className={`calendar-day-card booking-day-card ${isBooked ? 'is-booked' : 'is-available'}`}
          style={{
            minHeight: '84px',
            border: '1px solid #e9ecef',
            borderRadius: '8px',
            padding: '6px',
            background: isBooked ? '#dc2626' : '#f8f9fa'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px', color: isBooked ? '#ffffff' : '#333' }}>{day}</div>
          {isBooked ? (
            <div className="calendar-day-sub" style={{ fontSize: '0.72rem', color: '#ffffff', lineHeight: 1.3 }}>
              Already Booked
            </div>
          ) : (
            <div className="calendar-day-sub" style={{ fontSize: '0.72rem', color: '#868e96' }}>Available</div>
          )}
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
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '40px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
      }}>
        <button
          onClick={onBack}
          className="nav-back-btn"
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            marginBottom: '20px',
            color: '#667eea'
          }}
        >
          Back
        </button>

        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 className="form-heading" style={{ color: '#333', margin: '0 0 10px 0', fontSize: '2rem', fontWeight: '300' }}>
            Booking Details
          </h2>
          <p style={{ color: '#666', margin: 0 }}>Select your check-in and check-out dates</p>
          <div
            className="timing-chip"
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              color: '#1e3a8a',
              fontSize: '0.86rem',
              textAlign: 'left'
            }}
          >
            Check-in time: 7:30 AM | Check-out time: 6:30am
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              color: '#333', 
              fontWeight: '500' 
            }}>
              Check-in Date
            </label>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '6px' }}>
              Check-in time: 7:30 AM
            </div>
            <select
              value={bookingData.checkinDate}
              onChange={(e) => {
                const newCheckinDate = e.target.value;
                if (isDateBooked(newCheckinDate)) {
                  alert('Selected check-in date is already booked');
                  return;
                }
                const newData = { ...bookingData, checkinDate: newCheckinDate };
                
                // Clear checkout if invalid or conflicts with occupied nights.
                if (
                  bookingData.checkoutDate &&
                  !isCheckoutDateAllowed(newCheckinDate, bookingData.checkoutDate)
                ) {
                  newData.checkoutDate = '';
                }
                
                setBookingData(newData);
              }}
              style={{
                width: '100%',
                padding: '15px',
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                background: 'white'
              }}
              required
            >
              <option value="">Select check-in date</option>
              {availableDates.map(date => (
                <option key={date} value={date} disabled={isDateBooked(date)}>
                  {new Date(date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}{isDateBooked(date) ? ' (🔴 Already Booked)' : ''}
                </option>
              ))}
            </select>
            {bookingData.checkinDate && isDateBooked(bookingData.checkinDate) && (
              <div style={{ fontSize: '0.8rem', color: '#dc3545', marginTop: '5px' }}>
                This date is already booked.
              </div>
            )}
            {bookingAvailabilityError && (
              <div style={{ fontSize: '0.8rem', color: '#dc3545', marginTop: '5px' }}>
                {bookingAvailabilityError}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              color: '#333', 
              fontWeight: '500' 
            }}>
              Check-out Date
            </label>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '6px' }}>
              Check-out time: 6:30am
            </div>
            <select
              value={bookingData.checkoutDate}
              onChange={(e) => {
                const candidateCheckout = e.target.value;
                if (!bookingData.checkinDate) {
                  alert('Please select check-in date first');
                  return;
                }
                if (!isCheckoutDateAllowed(bookingData.checkinDate, candidateCheckout)) {
                  alert('Selected check-out date is not available for the chosen stay period');
                  return;
                }
                setBookingData({ ...bookingData, checkoutDate: candidateCheckout });
              }}
              style={{
                width: '100%',
                padding: '15px',
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                background: 'white'
              }}
              required
            >
              <option value="">Select check-out date</option>
              {availableDates.map(date => {
                // OYO-like behavior: allow checkout if stay nights are free,
                // even when checkout day is another booking's check-in day.
                const isDisabled = !bookingData.checkinDate || !isCheckoutDateAllowed(bookingData.checkinDate, date);
                return (
                  <option key={date} value={date} disabled={isDisabled}>
                    {new Date(date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}{isDateBooked(date) ? ' (🔴 Already Booked)' : ''}
                  </option>
                );
              })}
            </select>
            {bookingData.checkinDate && (
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
                Only dates after {new Date(bookingData.checkinDate).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })} are available for check-out
              </div>
            )}
          </div>

          <div className="calendar-panel" style={{
            background: '#ffffff',
            border: '1px solid #e9ecef',
            borderRadius: '12px',
            padding: '14px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                style={{
                  border: '1px solid #dee2e6',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  cursor: 'pointer'
                }}
              >
                Prev
              </button>
              <div style={{ fontWeight: 700, color: '#333' }}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                style={{
                  border: '1px solid #dee2e6',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  padding: '6px 10px',
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
              marginBottom: '8px',
              fontSize: '0.75rem',
              color: '#495057',
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
            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '8px' }}>
              Red date means confirmed booking. Name shown inside each booked date.
            </div>
            <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '6px', fontWeight: 600 }}>
              Check-in time: 7:30 AM | Check-out time: 6:30am
            </div>
          </div>

          <div style={{
            background: '#f8f9fa',
            padding: '20px',
            borderRadius: '10px',
            marginBottom: '30px',
            border: '1px solid #e9ecef'
          }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#333', fontSize: '1.2rem' }}>Payment Summary</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#666' }}>Total Booking Amount:</span>
                <span style={{ fontWeight: 'bold', color: '#333', fontSize: '1.1rem' }}>Rs {bookingData.totalAmount}</span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', color: '#333', fontWeight: '500' }}>
                Payment Option:
              </label>
              
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', border: bookingData.paymentType === 'advance' ? '2px solid #667eea' : '2px solid #e1e8ed', borderRadius: '8px', marginBottom: '10px' }}>
                  <input
                    type="radio"
                    name="paymentType"
                    value="advance"
                    checked={bookingData.paymentType === 'advance'}
                    onChange={(e) => {
                      const days = bookingData.checkinDate && bookingData.checkoutDate ? 
                        Math.ceil(Math.abs(new Date(bookingData.checkoutDate).getTime() - new Date(bookingData.checkinDate).getTime()) / (1000 * 60 * 60 * 24)) : 1;
                      const minAdvance = calculateMinAdvance(bookingData.totalAmount, days);
                      setBookingData({ ...bookingData, paymentType: 'advance', paymentAmount: minAdvance });
                    }}
                    style={{ marginRight: '10px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', color: '#333' }}>
                      Advance Payment - Rs {(() => {
                        const days = bookingData.checkinDate && bookingData.checkoutDate ? 
                          Math.ceil(Math.abs(new Date(bookingData.checkoutDate).getTime() - new Date(bookingData.checkinDate).getTime()) / (1000 * 60 * 60 * 24)) : 1;
                        return calculateMinAdvance(bookingData.totalAmount, days);
                      })()}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      {(() => {
                        const days = bookingData.checkinDate && bookingData.checkoutDate ? 
                          Math.ceil(Math.abs(new Date(bookingData.checkoutDate).getTime() - new Date(bookingData.checkinDate).getTime()) / (1000 * 60 * 60 * 24)) : 1;
                        return days <= 1 ? 'Minimum Rs 1000 for single day' : '30% of total amount for multiple days';
                      })()} - rest at check-in
                    </div>
                  </div>
                </label>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', border: bookingData.paymentType === 'full' ? '2px solid #667eea' : '2px solid #e1e8ed', borderRadius: '8px', marginBottom: '10px' }}>
                  <input
                    type="radio"
                    name="paymentType"
                    value="full"
                    checked={bookingData.paymentType === 'full'}
                    onChange={(e) => setBookingData({ ...bookingData, paymentType: 'full', paymentAmount: bookingData.totalAmount })}
                    style={{ marginRight: '10px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', color: '#333' }}>Full Payment - Rs {bookingData.totalAmount}</div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>Pay complete amount now</div>
                  </div>
                </label>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', border: bookingData.paymentType === 'custom' ? '2px solid #667eea' : '2px solid #e1e8ed', borderRadius: '8px' }}>
                  <input
                    type="radio"
                    name="paymentType"
                    value="custom"
                    checked={bookingData.paymentType === 'custom'}
                    onChange={(e) => setBookingData({ ...bookingData, paymentType: 'custom', paymentAmount: bookingData.customAmount })}
                    style={{ marginRight: '10px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: '#333', marginBottom: '8px' }}>Custom Amount</div>
                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>
                      Enter any amount you want to pay now
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={bookingData.customAmount}
                      onChange={(e) => {
                        // Only allow numbers
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        const amount = Math.min(parseInt(value) || 0, bookingData.totalAmount);
                        setBookingData({ 
                          ...bookingData, 
                          customAmount: amount,
                          paymentAmount: bookingData.paymentType === 'custom' ? amount : bookingData.paymentAmount
                        });
                      }}
                      onFocus={() => setBookingData({ ...bookingData, paymentType: 'custom', paymentAmount: bookingData.customAmount })}
                      onWheel={(e) => e.preventDefault()} // Disable mouse wheel scrolling
                      placeholder="Enter amount"
                      style={{
                        width: '120px',
                        padding: '8px 12px',
                        border: '1px solid #e1e8ed',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </label>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#666', fontSize: '1rem' }}>Amount to Pay Now:</span>
                <span style={{ fontWeight: 'bold', color: '#28a745', fontSize: '1.3rem' }}>Rs {bookingData.paymentAmount}</span>
              </div>
              {(bookingData.paymentType === 'advance' || bookingData.paymentType === 'custom') && bookingData.paymentAmount < bookingData.totalAmount && (
                <p style={{ color: '#666', fontSize: '0.9rem', margin: '10px 0 0 0' }}>
                  Remaining Rs {bookingData.totalAmount - bookingData.paymentAmount} to be paid at check-in
                </p>
              )}
            </div>
            
            <div style={{
              background: '#fee',
              border: '1px solid #fcc',
              borderRadius: '8px',
              padding: '15px',
              marginTop: '15px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: '#d32f2f', fontSize: '1.1rem', marginRight: '8px' }}>!</span>
                <span style={{ color: '#d32f2f', fontWeight: '600', fontSize: '1rem' }}>Important Note</span>
              </div>
              <p style={{ color: '#d32f2f', margin: 0, fontSize: '0.9rem' }}>
                Guests are kindly requested to clear any pending balance before check-in. A refundable security deposit of {'\u20B9'}500 is also required at the time of arrival.
                <br />
                <br />
                In addition, a separate {'\u20B9'}500 electricity security deposit will be collected during check-in. This amount will be refunded at check-out after adjusting for actual electricity consumption, if applicable.
                <br />
                <br />
                Kindly ignore this message if the above payments have already been completed.
              </p>
            </div>
          </div>

          <button
            className="primary-cta success-cta"
            type="submit"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '15px',
              padding: '18px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
              boxShadow: '0 5px 15px rgba(40, 167, 69, 0.3)'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Proceed to Payment
          </button>
        </form>
      </div>
    </div>
  );
};

// Payment Page
const PaymentPage: React.FC<{
  amount: number;
  onSuccess: () => Promise<void> | void;
  onBack: () => void;
}> = ({ amount, onSuccess, onBack }) => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [manualMode, setManualMode] = useState<'upi' | 'qr' | null>(null);

  const upiId = process.env.REACT_APP_UPI_ID || '8709276546@apl';
  const payeeName = process.env.REACT_APP_UPI_NAME || 'Jharkhand Chhatriya Sangh Bhawan';
  const transactionNote = 'Booking Payment';
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`;

  const loadRazorpayScript = () => {
    return new Promise<boolean>((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const completeManualPayment = async () => {
    setProcessing(true);
    setError('');
    try {
      await Promise.resolve(onSuccess());
      setManualMode(null);
    } catch (err: any) {
      setError(err?.message || 'Payment marked but booking save failed');
    } finally {
      setProcessing(false);
    }
  };

  const openUpiApp = () => {
    setError('');
    setManualMode('upi');
    window.open(upiLink, '_blank');
  };

  const startRazorpayPayment = async () => {
    setError('');

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setError('Unable to load Razorpay checkout. Please check internet connection.');
      return;
    }

    setProcessing(true);
    try {
      const bookingRef = `public_${Date.now()}`;
      const initiateResponse = await apiFetch('/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          bookingId: bookingRef
        })
      });

      const initiateResult = await parseJsonSafe(initiateResponse);
      if (!initiateResponse.ok) {
        throw new Error(initiateResult?.error || initiateResult?.message || 'Unable to initiate Razorpay payment');
      }

      const razorpayInstance = new (window as any).Razorpay({
        key: initiateResult?.keyId,
        amount: initiateResult?.amount,
        currency: initiateResult?.currency || 'INR',
        name: 'Jharkhand Chhatriya Sangh Bhawan',
        description: 'Booking Payment',
        order_id: initiateResult?.orderId,
        theme: {
          color: '#0f766e'
        },
        handler: async (paymentResponse: any) => {
          try {
            const verifyResponse = await apiFetch('/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(paymentResponse)
            });
            const verifyResult = await parseJsonSafe(verifyResponse);
            if (!verifyResponse.ok || !verifyResult?.verified) {
              throw new Error(verifyResult?.error || verifyResult?.message || 'Payment verification failed');
            }

            await Promise.resolve(onSuccess());
          } catch (err: any) {
            setError(err?.message || 'Payment verified but booking save failed');
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => setProcessing(false)
        }
      });

      razorpayInstance.on('payment.failed', (response: any) => {
        setError(response?.error?.description || 'Payment failed');
        setProcessing(false);
      });

      razorpayInstance.open();
    } catch (err: any) {
      setError(err?.message || 'Unable to start payment');
      setProcessing(false);
    }
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
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '40px',
        maxWidth: '460px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.1rem',
            cursor: 'pointer',
            marginBottom: '20px',
            color: '#667eea'
          }}
        >
          Back
        </button>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#111827', margin: '0 0 10px 0', fontSize: '1.9rem', fontWeight: '600' }}>
            Payment Options
          </h2>
          <p style={{ color: '#475569', margin: 0 }}>Choose Razorpay, UPI app, or QR payment</p>
        </div>

        <div style={{
          background: '#f8fafc',
          padding: '18px',
          borderRadius: '12px',
          marginBottom: '18px',
          textAlign: 'center',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ marginBottom: '6px', color: '#334155', fontWeight: 600 }}>Amount to Pay</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f766e' }}>Rs {amount}</div>
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

        <div style={{ display: 'grid', gap: '10px' }}>
          <button
            onClick={startRazorpayPayment}
            disabled={processing}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.85 : 1
            }}
          >
            {processing ? 'Processing...' : 'Pay with Razorpay'}
          </button>

          <button
            onClick={openUpiApp}
            disabled={processing}
            style={{
              width: '100%',
              background: '#1d4ed8',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.85 : 1
            }}
          >
            Pay with UPI App
          </button>

          <button
            onClick={() => {
              setError('');
              setManualMode('qr');
            }}
            disabled={processing}
            style={{
              width: '100%',
              background: '#f8fafc',
              color: '#111827',
              border: manualMode === 'qr' ? '2px solid #2563eb' : '1px solid #d1d5db',
              borderRadius: '12px',
              padding: '12px 14px',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.85 : 1,
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: manualMode === 'qr' ? '5px solid #2563eb' : '2px solid #9ca3af',
                  background: '#fff',
                  display: 'inline-block',
                  flexShrink: 0
                }}
              />
              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>Pay with UPI QR Code</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '26px' }}>
              <span style={{ fontWeight: 700, fontStyle: 'italic', color: '#6b7280' }}>BHIM</span>
              <span style={{ fontWeight: 700, color: '#7c3aed' }}>GPay</span>
              <span style={{ fontWeight: 700, color: '#0ea5e9' }}>paytm</span>
            </div>
          </button>
        </div>

        <div style={{
          background: '#ecfeff',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #a5f3fc',
          marginTop: '14px'
        }}>
          <p style={{ color: '#0e7490', margin: 0, fontSize: '0.86rem', textAlign: 'center' }}>
            UPI ID: {upiId}
          </p>
        </div>
      </div>

      {manualMode && (
        <div
          onClick={() => !processing && setManualMode(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.56)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '18px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.25)',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <h4 style={{ margin: '0 0 10px 0', color: '#111827' }}>
              {manualMode === 'qr' ? 'Scan QR and Pay' : 'Complete UPI Payment'}
            </h4>
            {manualMode === 'qr' && (
              <img
                src={qrCodeUrl}
                alt="UPI QR Code"
                style={{ width: '250px', height: '250px', objectFit: 'contain', marginBottom: '10px' }}
              />
            )}
            <p style={{ color: '#475569', margin: '0 0 12px 0', fontSize: '0.92rem' }}>
              After payment, click the button below to continue booking confirmation.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setManualMode(null)}
                disabled={processing}
                style={{
                  background: '#94a3b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={completeManualPayment}
                disabled={processing}
                style={{
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              >
                {processing ? 'Saving...' : 'Submit Payment Request'}
              </button>
            </div>
          </div>
        </div>
      )}
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

  return (
    <div className="page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="surface-card" style={{ background: 'rgba(255, 255, 255, 0.96)', borderRadius: '20px', padding: '32px', maxWidth: '520px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>Payment Approval Pending</h2>
        <p style={{ margin: '0 0 14px 0', color: '#475569' }}>
          {bookingCode ? `Booking Code: ${bookingCode}` : 'Your booking request'} is waiting for admin verification.
        </p>
        <div style={{ borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, color: approved ? '#166534' : rejected ? '#b91c1c' : '#b45309' }}>
            Status: {approved ? 'Approved' : rejected ? 'Rejected' : 'Pending Admin Approval'}
          </div>
          {rejected && (
            <div style={{ marginTop: '6px', color: '#7f1d1d', fontSize: '0.92rem' }}>
              money not received
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={onRefresh}
            style={{ border: 'none', borderRadius: '8px', padding: '10px 12px', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
          >
            Refresh Status
          </button>
          {(rejected || pending) && (
            <button
              onClick={onBackToPayment}
              style={{ border: 'none', borderRadius: '8px', padding: '10px 12px', background: '#64748b', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
            >
              Back to Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
// Confirmation Page
const ConfirmationPage: React.FC<{
  bookingData: BookingData;
  saveError: string;
  onNewBooking: () => void;
}> = ({ bookingData, saveError, onNewBooking }) => {
  
  // Automatically send WhatsApp message if enabled
  React.useEffect(() => {
    if (bookingData.whatsappNotification && bookingData.mobile) {
      // Auto-send WhatsApp message immediately when confirmation page loads
      const timer = setTimeout(() => {
        sendWhatsAppConfirmation();
      }, 500); // Small delay to ensure page is fully loaded
      
      return () => clearTimeout(timer);
    }
  }, []);
  
  const sendWhatsAppConfirmation = () => {
    const checkinDate = new Date(bookingData.checkinDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    const checkoutDate = new Date(bookingData.checkoutDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    const balanceAmount = bookingData.totalAmount - bookingData.paymentAmount;
    const bookingCodeLine = bookingData.bookingCode ? `*Booking Code:* ${bookingData.bookingCode}\n\n` : '';
    
    const message = `*Booking Confirmed*\n\n` +
      `Dear ${bookingData.name},\n` +
      `Thank you for choosing our service. Your booking has been successfully confirmed.\n\n` +
      `*Booking Details*\n\n` +
      bookingCodeLine +
      `*Name:* ${bookingData.name}\n\n` +
      `*Mobile:* ${bookingData.mobile}\n\n` +
      `*Purpose:* ${bookingData.purpose}\n\n` +
      `*Gender:* ${bookingData.gender || 'Not specified'}\n\n` +
      `${bookingData.email ? `*Email:* ${bookingData.email}\n\n` : ''}` +
      `*Check-in:* ${checkinDate}\n\n` +
      `*Check-in Time:* 7:30 AM\n\n` +
      `*Check-out:* ${checkoutDate}\n\n` +
      `*Check-out Time:* 6:30am\n\n` +
      `*Total Amount:* Rs ${bookingData.totalAmount.toLocaleString()}\n\n` +
      `*Advance Payment:* Rs ${bookingData.paymentAmount.toLocaleString()}\n\n` +
      `*Amount Paid:* Rs ${bookingData.paymentAmount.toLocaleString()}\n\n` +
      `${balanceAmount > 0 ? `*Balance Payable at Check-in:* Rs ${balanceAmount.toLocaleString()}\n\n` : ''}` +
      `*Venue Address*\n\n` +
      `Jharkhand Kshatriya Sangh Bhawan
      Outer Circle Road, Near Baldwin School, Veher Road, Kadma, Jamshedpur, Jharkhand - 831005\n\n` +        
      `*Additional Information*\n\n` +
      `Guests are kindly requested to clear any pending balance before check-in. A refundable security deposit of ₹500 is also required at the time of arrival.\n\n` +
      `In addition, a separate ₹500 electricity security deposit will be collected during check-in. This amount will be refunded at check-out after adjusting for actual electricity consumption, if applicable.\n\n` +
      `Kindly ignore this message if the above payments have already been completed.\n\n` +
      `We look forward to hosting you.\n` +
      `Thank you for your booking!`;
    
    // Create WhatsApp link
    const whatsappUrl = `https://wa.me/91${bookingData.mobile.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
    
    // Open WhatsApp in new tab
    window.open(whatsappUrl, '_blank');
  };

  const sendAdminNotification = () => {
    const adminWhatsApp = '7369024654';
    
    const checkinDate = new Date(bookingData.checkinDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const remainingBalance = bookingData.totalAmount - bookingData.paymentAmount;
    const paymentStatus = remainingBalance === 0 ? 'FULLY PAID' : `PAID Rs ${bookingData.paymentAmount}`;
    const checkoutDate = new Date(bookingData.checkoutDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const message = `*New Booking Alert*\n\n` +
      `${bookingData.bookingCode ? `*Booking Code:* ${bookingData.bookingCode}\n` : ''}` +
      `*Name:* ${bookingData.name}\n` +
      `*Mobile:* ${bookingData.mobile}\n` +
      `*Purpose:* ${bookingData.purpose}\n` +
      `*Gender:* ${bookingData.gender || 'Not specified'}\n` +
      `${bookingData.email ? `*Email:* ${bookingData.email}\n` : ''}` +
      `*Check-in:* ${checkinDate} (7:30 AM)\n` +
      `*Check-out:* ${checkoutDate} (6:30am)\n` +
      `*Payment Status:* ${paymentStatus}\n` +
      `*Remaining Balance:* Rs ${remainingBalance}`;
    
    // Create WhatsApp link for admin
    const adminWhatsappUrl = `https://wa.me/91${adminWhatsApp}?text=${encodeURIComponent(message)}`;
    
    // Open WhatsApp in new tab
    window.open(adminWhatsappUrl, '_blank');
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
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '40px',
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ color: '#28a745', margin: '0 0 10px 0', fontSize: '2.5rem', fontWeight: '300' }}>
          Booking Confirmed!
        </h1>
        <p style={{ color: '#666', marginBottom: '30px', fontSize: '1.1rem' }}>
          Your booking has been successfully confirmed
        </p>
        {saveError && (
          <div style={{
            background: '#fff3cd',
            border: '1px solid #ffeeba',
            color: '#856404',
            padding: '10px 14px',
            borderRadius: '10px',
            marginBottom: '20px',
            textAlign: 'left'
          }}>
            MongoDB save warning: {saveError}
          </div>
        )}

        <div style={{
          background: '#f8f9fa',
          padding: '25px',
          borderRadius: '15px',
          marginBottom: '30px',
          textAlign: 'left',
          border: '1px solid #e9ecef'
        }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#333', textAlign: 'center' }}>Booking Details</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Name:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{bookingData.name}</span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Code:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{bookingData.bookingCode || 'Pending'}</span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Mobile:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{bookingData.mobile}</span>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Purpose:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{bookingData.purpose}</span>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Gender:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{bookingData.gender || 'Not specified'}</span>
          </div>

          {bookingData.email && (
            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#333' }}>Email:</strong>
              <span style={{ marginLeft: '10px', color: '#666' }}>{bookingData.email}</span>
            </div>
          )}
          
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Check-in:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>
              {new Date(bookingData.checkinDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Check-out:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>
              {new Date(bookingData.checkoutDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#333' }}>Advance Payment:</strong>
            <span style={{ marginLeft: '10px', color: '#166534', fontWeight: 700 }}>Rs {bookingData.paymentAmount}</span>
          </div>
          
          <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '15px', marginTop: '15px' }}>
            <div style={{ marginBottom: '10px' }}>
              <strong style={{ color: '#28a745' }}>Payment Status:</strong>
              <span style={{ marginLeft: '10px', color: '#28a745', fontWeight: 'bold' }}>
                PAID (Rs {bookingData.paymentAmount})
              </span>
            </div>
            
            <div>
              <strong style={{ color: '#333' }}>Remaining Balance:</strong>
              <span style={{ marginLeft: '10px', color: bookingData.totalAmount - bookingData.paymentAmount > 0 ? '#dc3545' : '#28a745', fontWeight: 'bold' }}>
                Rs {bookingData.totalAmount - bookingData.paymentAmount}
                {bookingData.totalAmount - bookingData.paymentAmount === 0 && ' Paid'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ 
          background: '#d4edda', 
          padding: '20px', 
          borderRadius: '10px',
          marginBottom: '30px',
          border: '1px solid #c3e6cb'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#155724' }}>Confirmation Message</h4>
          <p style={{ color: '#155724', margin: 0, fontSize: '0.95rem' }}>
            Your booking confirmation has been sent to your mobile number. Please save this information for your records. 
            Show this confirmation at check-in.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {bookingData.whatsappNotification && (
            <button
              onClick={sendWhatsAppConfirmation}
              style={{
                background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '15px',
                padding: '18px 40px',
                fontSize: '1.1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'transform 0.2s ease',
                boxShadow: '0 5px 15px rgba(37, 211, 102, 0.3)'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Send to WhatsApp
            </button>
          )}
          
          <button
            onClick={sendAdminNotification}
            style={{
              background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '15px',
              padding: '18px 40px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
              boxShadow: '0 5px 15px rgba(255, 107, 107, 0.3)',
              marginBottom: '15px'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Notify Admin
          </button>
          
          <button
            onClick={onNewBooking}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '15px',
              padding: '18px 40px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
              boxShadow: '0 5px 15px rgba(102, 126, 234, 0.3)'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Make New Booking
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminLoginPage: React.FC<{ onBack: () => void; onLoginSuccess: () => void }> = ({ onBack, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      onLoginSuccess();
      return;
    }

    setError('Invalid admin credentials');
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
          style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', marginBottom: '14px' }}
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
            style={{
              width: '100%',
              border: 'none',
              borderRadius: '12px',
              padding: '12px',
              background: 'linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%)',
              color: 'white',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Login
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
  onLogout: () => void;
}> = ({ hallImageUrls, setHallImageUrls, onBackToBooking, onLogout }) => {
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
  const [selectedHallImageIndex, setSelectedHallImageIndex] = useState(0);
  const [adminLogoUrl, setAdminLogoUrl] = useState<string>(() => getStoredString(ADMIN_LOGO_STORAGE_KEY, ''));
  const [paymentApprovalByBooking, setPaymentApprovalByBooking] = useState<PaymentApprovalMap>(() => readPaymentApprovalMap());
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

  React.useEffect(() => {
    writePaymentApprovalMap(paymentApprovalByBooking);
  }, [paymentApprovalByBooking]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PAYMENT_APPROVAL_STORAGE_KEY) {
        setPaymentApprovalByBooking(readPaymentApprovalMap());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const removeComplain = (id: string) => {
    setComplainList((prev) => prev.filter((item) => item.id !== id));
  };

  const removeFeedback = (id: string) => {
    setFeedbackList((prev) => prev.filter((item) => item.id !== id));
  };

  const resolveAndWhatsappComplain = (item: AdminComplain) => {
    const digits = item.mobile.replace(/\D/g, '');
    const resolutionMessage = `Hello ${item.name || 'Guest'}, your complaint${item.bookingCode ? ` (Booking Code: ${item.bookingCode})` : ''} has been resolved. Thank you for your patience.`;
    if (digits.length >= 10) {
      const whatsappUrl = `https://wa.me/91${digits}?text=${encodeURIComponent(resolutionMessage)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      alert('Mobile number not available for this complaint');
    }
    removeComplain(item.id);
  };

  const loadRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/bookings');
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Unable to load bookings');
      }
      setRecords(result.bookings || []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    setError('');
    try {
      const response = await apiFetch('/bookings/export');
      if (!response.ok) {
        throw new Error('Export failed');
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
        body: formData
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Import failed');
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
    loadRecords();
  }, []);

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
    ? ` | Code ${latestPendingRequest.bookingCode || '----'} | ${latestPendingRequest.name || 'Guest'} | Check-in ${new Date(latestPendingRequest.checkinDate).toLocaleDateString('en-IN')} | Check-out ${new Date(latestPendingRequest.checkoutDate).toLocaleDateString('en-IN')}`
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
  const upcomingTickerText = upcomingBookings.length
    ? (() => {
        const row = upcomingBookings[0];
        const finalAmount = Number(row.finalAmount ?? row.totalAmount ?? 0);
        const pendingAmount = Math.max(finalAmount - Number(row.paymentAmount ?? 0), 0);
        return `Code ${row.bookingCode || '----'} | Check-in ${new Date(row.checkinDate).toLocaleDateString('en-IN')} | Check-out ${new Date(row.checkoutDate).toLocaleDateString('en-IN')} | Pending Rs ${pendingAmount}`;
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
      `Original Amount: ₹${offerForm.original || '0'}\n` +
      `Discount Applied: ₹${offerForm.discount || '0'}\n` +
      `Final Payable Amount: ₹${offerForm.total || '0'}\n\n` +
      `Payment Status: ${offerForm.paymentStatus}${offerForm.paymentStatus.toLowerCase().includes('fully') ? ' ✅' : ''}\n\n` +
      `You have received a discount of ₹${offerForm.discount || '0'}. The final payable amount has been updated accordingly.\n\n` +
      `Important Payment Information\n\n` +
      `Kindly ensure that any pending balance is cleared prior to check-in, along with a refundable security deposit of ₹500.\n\n` +
      `Additionally, a separate ₹500 electricity security deposit will be collected at the time of check-in. This amount will be refunded at check-out after adjustment against actual electricity consumption, if applicable.\n\n` +
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
  const isCustomHallImage = Boolean(selectedHallImageUrl) && selectedHallImageUrl !== DEFAULT_HALL_IMAGE;

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
      setHallImageUrls(nextList.slice(0, 12));
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
    setHallImageUrls(next);
    setSelectedHallImageIndex(Math.max(next.length - 1, 0));
    setError('');
  };

  const removeSelectedHallPhoto = () => {
    if (!hallImageUrls.length) return;
    const next = hallImageUrls.filter((_, idx) => idx !== selectedHallImageIndex);
    setHallImageUrls(next);
    setSelectedHallImageIndex((prev) => Math.max(0, Math.min(prev, next.length - 1)));
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

  const approveUserPayment = (record: BookingRecord) => {
    if (!record?._id) return;
    setPaymentApprovalByBooking((prev) => {
      const current = prev[record._id];
      return {
        ...prev,
        [record._id]: {
          ...current,
          userMarked: true,
          adminApproved: true,
          adminRejected: false,
          rejectionReason: '',
          approvedAt: new Date().toISOString()
        }
      };
    });
    setError('');
  };

  const rejectUserPayment = (record: BookingRecord) => {
    if (!record?._id) return;
    setPaymentApprovalByBooking((prev) => {
      const current = prev[record._id];
      return {
        ...prev,
        [record._id]: {
          ...current,
          userMarked: true,
          adminApproved: false,
          adminRejected: true,
          rejectionReason: 'money not received'
        }
      };
    });
    setError('');
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
      try {
        window.localStorage.setItem(ADMIN_LOGO_STORAGE_KEY, result);
      } catch {
        // ignore storage errors
      }
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const clearAdminLogo = () => {
    setAdminLogoUrl('');
    try {
      window.localStorage.removeItem(ADMIN_LOGO_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminBookingForm)
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Unable to create admin booking');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Unable to update booking');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Fallback to DELETE if POST route is unavailable.
      if (response.status === 404 || response.status === 405) {
        const query = new URLSearchParams({ reason: payload.reason }).toString();
        response = await apiFetch(`/bookings/${pendingDelete.id}?${query}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const result = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Unable to delete booking');
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
  const dashboardTopRef = React.useRef<HTMLDivElement | null>(null);
  const bookingDetailsRef = React.useRef<HTMLDivElement | null>(null);
  const quickBookingRef = React.useRef<HTMLDivElement | null>(null);
  const offerComplainFeedbackRef = React.useRef<HTMLDivElement | null>(null);
  const managementImageHistoryRef = React.useRef<HTMLDivElement | null>(null);
  const totalBookingRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToAdminSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onBackToBooking} style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>Home</button>
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
                  approveUserPayment(pendingApprovalRecords[0]);
                }}
                style={{ border: 'none', borderRadius: '8px', padding: '7px 10px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Approve Payment
              </button>
              <button
                onClick={() => {
                  rejectUserPayment(pendingApprovalRecords[0]);
                }}
                style={{ border: 'none', borderRadius: '8px', padding: '7px 10px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Reject Payment
              </button>
            </div>
          )}
        </div>

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
                onClick={loadRecords}
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

        <div className="admin-card" ref={managementImageHistoryRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 5 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a', marginBottom: '10px' }}>MANAGEMENT</h3>
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
                                Booking Code: {item.bookingCode}
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

        <div className="admin-card" style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 6 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>IMAGE</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: '12px', alignItems: 'start' }}>
            {selectedHallImageUrl ? (
              <div>
                <img
                  src={selectedHallImageUrl}
                  alt="Hall/Room"
                  style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #cbd5e1', display: 'block' }}
                />
                <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                  Current Photo: {isCustomHallImage ? 'Uploaded' : 'Default'} ({hallImageUrls.length}/12)
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
                title="Use Default"
                aria-label="Use Default"
                onClick={() => {
                  setHallImageUrls(DEFAULT_HALL_IMAGES);
                  setSelectedHallImageIndex(0);
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

        {error && <div style={{ color: '#b91c1c', marginBottom: '10px' }}>{error}</div>}
        {loading && <div style={{ color: '#334155', marginBottom: '10px' }}>Loading...</div>}

        <div className="admin-card" ref={offerComplainFeedbackRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 7 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>OFFER MESSAGE</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
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
            <input
              value={selectedOfferBooking ? selectedOfferPendingAmount : ''}
              readOnly
              placeholder="Pending amount"
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '8px' }}>
            <input value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} placeholder="Guest Name" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input value={offerForm.checkin} onChange={(e) => setOfferForm({ ...offerForm, checkin: e.target.value })} placeholder="Check-in" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input value={offerForm.checkout} onChange={(e) => setOfferForm({ ...offerForm, checkout: e.target.value })} placeholder="Check-out" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input value={offerForm.roomType} onChange={(e) => setOfferForm({ ...offerForm, roomType: e.target.value })} placeholder="Hall/Room Purpose" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input value={offerForm.original} onChange={(e) => setOfferForm({ ...offerForm, original: e.target.value })} placeholder="Original Amount" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input value={offerForm.discount} onChange={(e) => setOfferForm({ ...offerForm, discount: e.target.value })} placeholder="Discount" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input value={offerForm.total} onChange={(e) => setOfferForm({ ...offerForm, total: e.target.value })} placeholder="Final Payable Amount" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input value={offerForm.paymentStatus} onChange={(e) => setOfferForm({ ...offerForm, paymentStatus: e.target.value })} placeholder="Payment Status" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', color: '#0f172a', whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
            {renderedOfferMessage || 'Select an upcoming booking code to preview message.'}
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
          </div>
        </div>

        <div className="admin-card" ref={quickBookingRef} style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 1 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>QUICK BOOKING</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
            <input
              value={adminBookingForm.name}
              onChange={(e) => setAdminBookingForm({ ...adminBookingForm, name: e.target.value })}
              placeholder="Customer Name"
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
            <input
              value={adminBookingForm.mobile}
              onChange={(e) => setAdminBookingForm({ ...adminBookingForm, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              placeholder="Mobile"
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
            <input
              type="date"
              value={adminBookingForm.checkinDate}
              onChange={(e) => setAdminBookingForm({ ...adminBookingForm, checkinDate: e.target.value })}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
            <input
              type="date"
              value={adminBookingForm.checkoutDate}
              onChange={(e) => setAdminBookingForm({ ...adminBookingForm, checkoutDate: e.target.value })}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
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
            {adminBookingForm.bookingPurpose === 'other' && (
              <input
                value={adminBookingForm.bookingPurposeOther}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, bookingPurposeOther: e.target.value })}
                placeholder="Purpose details"
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            )}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={createAdminNoPaymentBooking}
              disabled={saving}
              style={{ border: 'none', borderRadius: '8px', padding: '10px 14px', background: '#0f766e', color: 'white', cursor: 'pointer' }}
            >
              {saving ? 'Creating...' : 'Create No-Payment Booking'}
            </button>
          </div>
        </div>

        <div className="admin-card" style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginBottom: '14px', order: 8 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a', marginBottom: '10px' }}>COMPLAIN AND FEEDBACK</h3>
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
                            Booking Code: {item.bookingCode}
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
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Edit Booking</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
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
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Purpose</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Mobile</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Check-in</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Check-out</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Total</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Advance Paid</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Discount</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Final</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Pending</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Payment Approval</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!records.length ? (
                    <tr>
                      <td colSpan={13} style={{ padding: '10px', color: '#64748b' }}>No records</td>
                    </tr>
                  ) : (
                    records.map((row) => (
                      <tr key={row._id}>
                        {(() => {
                          const approval = paymentApprovalByBooking[row._id];
                          const userMarked = Boolean(approval?.userMarked);
                          const adminApproved = Boolean(approval?.adminApproved);
                          const adminRejected = Boolean(approval?.adminRejected);
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
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#166534' }}>Rs {Number(row.paymentAmount || 0)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>Rs {Number(row.discountAmount || 0)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>Rs {Number(row.finalAmount ?? row.totalAmount)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: Number(row.finalAmount ?? row.totalAmount) - Number(row.paymentAmount || 0) > 0 ? '#b45309' : '#166534' }}>
                          Rs {Math.max(Number(row.finalAmount ?? row.totalAmount) - Number(row.paymentAmount || 0), 0)}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                          {adminApproved ? (
                            <div style={{ color: '#166534', fontWeight: 700 }}>Approved</div>
                          ) : userMarked ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                onClick={() => approveUserPayment(row)}
                                style={{ border: 'none', borderRadius: '8px', padding: '6px 10px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                              >
                                Money Received
                              </button>
                              <button
                                onClick={() => rejectUserPayment(row)}
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

          <div className="admin-card" style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '14px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '6px 10px', background: '#f8f9fa', cursor: 'pointer' }}>Prev</button>
              <h3 style={{ margin: 0, color: '#0f172a' }}>{monthYearTitle}</h3>
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '6px 10px', background: '#f8f9fa', cursor: 'pointer' }}>Next</button>
            </div>
            <div className="calendar-weekdays-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px', marginBottom: '8px', fontWeight: 700, color: '#495057', fontSize: '0.75rem' }}>
              <div style={{ textAlign: 'center' }}>Sun</div>
              <div style={{ textAlign: 'center' }}>Mon</div>
              <div style={{ textAlign: 'center' }}>Tue</div>
              <div style={{ textAlign: 'center' }}>Wed</div>
              <div style={{ textAlign: 'center' }}>Thu</div>
              <div style={{ textAlign: 'center' }}>Fri</div>
              <div style={{ textAlign: 'center' }}>Sat</div>
            </div>
            <div className="calendar-days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
              {calendarCells}
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
`;
document.head.appendChild(style);
export default App;






