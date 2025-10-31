import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate Firebase configuration
const isFirebaseConfigured = Object.values(firebaseConfig).every(value => value && value !== 'undefined');

if (!isFirebaseConfigured) {
  console.warn('⚠️ Firebase configuration incomplete. Some features may not work properly.');
  console.warn('Missing config values:', Object.entries(firebaseConfig).filter(([key, value]) => !value || value === 'undefined').map(([key]) => key));
}

let app;
try {
  // Initialize Firebase with error handling
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase app initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  throw new Error('Firebase initialization failed. Please check your configuration.');
}

// Initialize Auth without persistence
export const auth = getAuth(app);
if (isFirebaseConfigured) {
  console.log('✅ Firebase Auth initialized (no persistence)');
} else {
  console.warn('⚠️ Firebase Auth initialized with incomplete configuration');
}

// Initialize Firestore without offline persistence
export const db = getFirestore(app);

if (isFirebaseConfigured) {
  console.log('✅ Firestore initialized (online-only mode)');
  console.log('ℹ️ Offline persistence disabled - requires internet connection');
} else {
  console.warn('⚠️ Firestore initialized with incomplete configuration');
}

// Initialize Analytics only in production with comprehensive error handling
const isProduction = import.meta.env.PROD;
let analytics: ReturnType<typeof getAnalytics> | null = null;

if (isProduction && isFirebaseConfigured) {
  try {
    analytics = getAnalytics(app);
    console.log('✅ Firebase Analytics initialized');
  } catch (error) {
    console.warn('⚠️ Failed to initialize Firebase Analytics:', error);
    analytics = null;
  }
} else if (isProduction) {
  console.warn('⚠️ Skipping Firebase Analytics due to incomplete configuration');
} else {
  console.log('ℹ️ Firebase Analytics disabled in development mode');
}

export { analytics };

export default app;