import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from './firebase';
import { User } from 'firebase/auth';

// Collections
const COLLECTIONS = {
  USERS: 'users',
  CHAT_MESSAGES: 'chatMessages',
  ROOMS: 'rooms',
  USER_SESSIONS: 'userSessions'
};

// User Data Management
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  lastActive: any; // Firestore Timestamp
  totalSessions: number;
  preferredAvatar: string;
  createdAt: any; // Firestore Timestamp
  settings: {
    notifications: boolean;
    soundEnabled: boolean;
    theme: 'light' | 'dark';
  };
}

// Chat Message Interface
export interface ChatMessage {
  id?: string;
  roomId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  timestamp: any; // Firestore Timestamp
  type: 'message' | 'system' | 'join' | 'leave';
}

// Room Session Interface
export interface RoomSession {
  id?: string;
  roomId: string;
  roomName: string;
  userId: string;
  userName: string;
  joinedAt: any; // Firestore Timestamp
  leftAt?: any; // Firestore Timestamp
  duration?: number; // in minutes
  isActive: boolean;
}

// User Profile Functions
export const createUserProfile = async (user: User): Promise<void> => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, user.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      const userProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Anonymous',
        photoURL: user.photoURL || '',
        lastActive: serverTimestamp(),
        totalSessions: 0,
        preferredAvatar: 'adam',
        createdAt: serverTimestamp(),
        settings: {
          notifications: true,
          soundEnabled: true,
          theme: 'light'
        }
      };
      
      await setDoc(userRef, userProfile);
      console.log('✅ User profile created for:', user.displayName);
    } else {
      // Update last active
      await updateDoc(userRef, {
        lastActive: serverTimestamp()
      });
      console.log('✅ User profile updated for:', user.displayName);
    }
  } catch (error) {
    console.error('❌ Error creating/updating user profile:', error);
  }
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return null;
  }
};

export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<void> => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, updates);
    console.log('✅ User profile updated');
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
  }
};

// Chat History Functions
export const saveChatMessage = async (message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<string | null> => {
  try {
    const chatMessage: Omit<ChatMessage, 'id'> = {
      ...message,
      timestamp: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.CHAT_MESSAGES), chatMessage);
    console.log('💬 Chat message saved:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error saving chat message:', error);
    return null;
  }
};

export const getChatHistory = async (roomId: string, limitCount: number = 50): Promise<ChatMessage[]> => {
  try {
    const q = query(
      collection(db, COLLECTIONS.CHAT_MESSAGES),
      where('roomId', '==', roomId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    const messages: ChatMessage[] = [];
    
    querySnapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      } as ChatMessage);
    });
    
    return messages.reverse(); // Return oldest first
  } catch (error) {
    console.error('❌ Error getting chat history:', error);
    return [];
  }
};

export const subscribeToChatMessages = (
  roomId: string, 
  callback: (messages: ChatMessage[]) => void,
  limitCount: number = 50
): (() => void) => {
  const q = query(
    collection(db, COLLECTIONS.CHAT_MESSAGES),
    where('roomId', '==', roomId),
    orderBy('timestamp', 'asc'),
    limit(limitCount)
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const messages: ChatMessage[] = [];
    querySnapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      } as ChatMessage);
    });
    callback(messages);
  }, (error) => {
    console.error('❌ Error in chat subscription:', error);
  });
};

// Room Session Functions
export const startRoomSession = async (userId: string, userName: string, roomId: string, roomName: string): Promise<string | null> => {
  try {
    const session: Omit<RoomSession, 'id'> = {
      roomId,
      roomName,
      userId,
      userName,
      joinedAt: serverTimestamp(),
      isActive: true
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.USER_SESSIONS), session);
    console.log('🚪 Room session started:', docRef.id);
    
    // Update user's total sessions
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    const userProfile = await getUserProfile(userId);
    await updateDoc(userRef, {
      totalSessions: (userProfile?.totalSessions || 0) + 1,
      lastActive: serverTimestamp()
    });
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error starting room session:', error);
    return null;
  }
};

export const endRoomSession = async (sessionId: string): Promise<void> => {
  try {
    const sessionRef = doc(db, COLLECTIONS.USER_SESSIONS, sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (sessionDoc.exists()) {
      const sessionData = sessionDoc.data() as RoomSession;
      const joinedAt = sessionData.joinedAt?.toDate();
      const leftAt = new Date();
      const duration = joinedAt ? Math.round((leftAt.getTime() - joinedAt.getTime()) / (1000 * 60)) : 0;
      
      await updateDoc(sessionRef, {
        leftAt: serverTimestamp(),
        duration,
        isActive: false
      });
      
      console.log('🚪 Room session ended:', sessionId, `Duration: ${duration} minutes`);
    }
  } catch (error) {
    console.error('❌ Error ending room session:', error);
  }
};

export const getUserSessions = async (userId: string, limitCount: number = 20): Promise<RoomSession[]> => {
  try {
    const q = query(
      collection(db, COLLECTIONS.USER_SESSIONS),
      where('userId', '==', userId),
      orderBy('joinedAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    const sessions: RoomSession[] = [];
    
    querySnapshot.forEach((doc) => {
      sessions.push({
        id: doc.id,
        ...doc.data()
      } as RoomSession);
    });
    
    return sessions;
  } catch (error) {
    console.error('❌ Error getting user sessions:', error);
    return [];
  }
};

// Analytics Functions
export const getActiveUsersCount = async (): Promise<number> => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const q = query(
      collection(db, COLLECTIONS.USERS),
      where('lastActive', '>=', fiveMinutesAgo)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('❌ Error getting active users count:', error);
    return 0;
  }
};

// Utility Functions
export const cleanupOldChatMessages = async (roomId: string, daysOld: number = 30): Promise<void> => {
  try {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, COLLECTIONS.CHAT_MESSAGES),
      where('roomId', '==', roomId),
      where('timestamp', '<=', cutoffDate)
    );
    
    const querySnapshot = await getDocs(q);
    const messagesToDelete: string[] = [];
    
    querySnapshot.forEach((doc) => {
      messagesToDelete.push(doc.id);
    });
    
    // Note: In a real app, you'd use Firebase Functions for batch deletes
    console.log(`🧹 Found ${messagesToDelete.length} old messages to cleanup for room ${roomId}`);
  } catch (error) {
    console.error('❌ Error cleaning up old messages:', error);
  }
};