import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Hardcoded values (remember to never commit sensitive keys to public repos!)
const supabaseUrl = 'https://your-supabase-project-url.supabase.co';
const supabaseAnonKey = 'your-supabase-anon-key';

// Storage configuration
const ExpoSecureStorage = {
  getItem: (key: string) => {
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    AsyncStorage.removeItem(key);
  },
};

// Create a memory-only storage for SSR
const MemoryStorage = {
  getItem: (_key: string) => Promise.resolve(null),
  setItem: (_key: string, _value: string) => Promise.resolve(),
  removeItem: (_key: string) => Promise.resolve(),
};

// Configure storage based on environment
const storage = typeof window !== 'undefined'
  ? (Platform.OS === 'web' ? localStorage : ExpoSecureStorage)
  : MemoryStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Helper function to handle Google Sign In
export const signInWithGoogle = async () => {
  try {
    
    // Use window.location.origin for web, makeRedirectUri for native
    const redirectUrl = Platform.select({
      web: window.location.origin,
      default: makeRedirectUri()
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) throw error;
    
    return data;

  } catch (error) {
    console.error('Error in signInWithGoogle:', error);
    throw error;
  }
};

export const signOut = () => supabase.auth.signOut();
