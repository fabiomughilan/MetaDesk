import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';
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

// Initialize Auth with enhanced error handling
export const auth = getAuth(app);
if (isFirebaseConfigured) {
  auth.setPersistence(browserLocalPersistence)
    .then(() => {
      console.log('✅ Firebase Auth persistence enabled');
    })
    .catch((error) => {
      console.error("❌ Firebase Auth persistence error:", error);
      // Continue without persistence if it fails
    });
} else {
  console.warn('⚠️ Skipping Firebase Auth persistence due to incomplete configuration');
}

// Initialize Firestore with enhanced error handling and offline resilience
export const db = getFirestore(app);

if (isFirebaseConfigured) {
  // Enable offline persistence with comprehensive error handling
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log('✅ Firestore offline persistence enabled');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ Firestore offline persistence failed: Multiple tabs open. App will work online only.');
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Firestore offline persistence failed: Browser not supported. App will work online only.');
      } else if (err.code === 'invalid-argument') {
        console.warn('⚠️ Firestore offline persistence failed: Invalid configuration. App will work online only.');
      } else {
        console.warn('⚠️ Firestore offline persistence failed:', err.message, '. App will work online only.');
      }
      // Add graceful degradation - continue without offline persistence
    });
} else {
  console.warn('⚠️ Skipping Firestore offline persistence due to incomplete configuration');
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