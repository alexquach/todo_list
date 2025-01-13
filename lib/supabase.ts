import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Hardcoded values (remember to never commit sensitive keys to public repos!)
const supabaseUrl = 'https://your-supabase-project-url.supabase.co';
const supabaseAnonKey = 'your-supabase-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
