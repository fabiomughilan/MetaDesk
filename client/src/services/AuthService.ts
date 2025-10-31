import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth } from './firebase';
import { createUserProfile } from './FirestoreService';
import store from '../stores';
import { setUser, setLoading, setError } from '../stores/AuthStore';

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    
    // Create/update user profile in Firestore
    await createUserProfile(result.user);
    
    return result.user;
  } catch (error: any) {
    let errorMessage = 'Failed to sign in with Google.';
    if (error.code === 'auth/popup-blocked') {
      errorMessage = 'Pop-up was blocked. Please allow pop-ups for this site.';
    } else if (error.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Sign-in was cancelled.';
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    store.dispatch(setError(errorMessage));
    throw error;
  }
};

export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error: any) {
    store.dispatch(setError('Failed to sign out. Please try again.'));
    console.error('Sign out error:', error);
    throw error;
  }
};

// Initialize auth listener
export const initializeAuth = async () => {
  store.dispatch(setLoading(true));
  try {
    // Set persistence to LOCAL (survive browser restart)
    await setPersistence(auth, browserLocalPersistence);
    
    // Set up auth state listener
    return onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        // Update user profile when user signs in
        await createUserProfile(user);
      }
      store.dispatch(setUser(user));
    }, (error) => {
      store.dispatch(setError('Authentication error: Please try again later.'));
      console.error('Auth state change error:', error);
    });
  } catch (error) {
    store.dispatch(setError('Failed to initialize authentication.'));
    console.error('Auth initialization error:', error);
    store.dispatch(setLoading(false));
  }
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};