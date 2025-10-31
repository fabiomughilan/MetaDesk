import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth } from './firebase';
import store from '../stores';
import { setUser, setLoading, setError } from '../stores/AuthStore';

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    store.dispatch(setError(error.message));
    throw error;
  }
};

export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error: any) {
    store.dispatch(setError(error.message));
    throw error;
  }
};

// Initialize auth listener
export const initializeAuth = () => {
  store.dispatch(setLoading(true));
  return onAuthStateChanged(auth, (user: User | null) => {
    store.dispatch(setUser(user));
  });
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};