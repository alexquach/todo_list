import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

// Configuration for Google OAuth
const CLIENT_ID = '';
const CLIENT_SECRET = ''; // Add your client secret from Google Cloud Console here

// Create a safer way to get the redirect URI that works with SSR
const getRedirectUri = () => {
  // Check for SSR (no window object)
  if (typeof window === 'undefined') {
    // Return a placeholder during SSR
    return 'http://localhost:8081/redirect'; // Default fallback
  }
  
  // In browser environment
  if (Platform.OS === 'web') {
    return `${window.location.origin}/redirect`;
  }
  
  // For native platforms
  return AuthSession.makeRedirectUri({
    scheme: 'todolistapp',
    path: 'redirect'
  });
};

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

WebBrowser.maybeCompleteAuthSession();

interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  colorId?: string;
}

type GroupedEvents = {
  [key: string]: CalendarEvent[];
};

export default function GoogleCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);

  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };

  // Check if we have a stored token on component mount
  useEffect(() => {
    loadToken();
  }, []);

  // Set up the redirect URI once the component mounts
  useEffect(() => {
    // Safe to access browser APIs here
    setRedirectUri(getRedirectUri());
  }, []);

  // Load token from AsyncStorage
  const loadToken = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('google_calendar_token');
      if (storedToken) {
        setToken(storedToken);
        fetchEvents(storedToken);
      }
    } catch (e: unknown) {
      console.error('Failed to load token', e);
    }
  };

  // Save token to AsyncStorage
  const saveToken = async (newToken: string) => {
    try {
      await AsyncStorage.setItem('google_calendar_token', newToken);
    } catch (e: unknown) {
      console.error('Failed to save token', e);
    }
  };

  // Handle the authentication flow
  const signInWithGoogle = async () => {
    try {
      // Only proceed if we have a redirect URI
      if (!redirectUri) {
        setError("App is still initializing, please try again");
        return;
      }
      
      setLoading(true);
      setError(null);
      
      console.log('Using redirect URI:', redirectUri);

      const request = new AuthSession.AuthRequest({
        clientId: CLIENT_ID,
        scopes: SCOPES,
        redirectUri: redirectUri,
        // Add PKCE code challenge method
        usePKCE: true,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      });

      const result = await request.promptAsync(discovery);
      
      if (result.type === 'success') {
        console.log('Auth successful, exchanging code for token');
        
        // Create token exchange parameters with proper TypeScript interface
        const tokenParams: {
          code: string;
          client_id: string;
          client_secret?: string;
          redirect_uri: string;
          grant_type: string;
          code_verifier?: string;
        } = {
          code: result.params.code,
          client_id: CLIENT_ID,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          // Include the code verifier from the request
          code_verifier: request.codeVerifier,
        };
        
        // Add client_secret for web platform
        if (Platform.OS === 'web') {
          tokenParams.client_secret = CLIENT_SECRET;
        }
        
        console.log('Token request params:', JSON.stringify({
          ...tokenParams,
          client_secret: tokenParams.client_secret ? '***HIDDEN***' : undefined,
          code_verifier: tokenParams.code_verifier ? '***HIDDEN***' : undefined,
        }));
        
        const exchangeResult = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(tokenParams).toString(),
        });
        
        const tokenData = await exchangeResult.json();
        console.log('Token response status:', exchangeResult.status);
        
        if (!tokenData.access_token) {
          console.error('Token exchange failed:', tokenData);
          setError(`Failed to get access token: ${tokenData.error || 'Unknown error'} - ${tokenData.error_description || ''}`);
        } else {
          setToken(tokenData.access_token);
          saveToken(tokenData.access_token);
          fetchEvents(tokenData.access_token);
        }
      } else {
        setError('Authentication was canceled or failed');
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Authentication error: ${errorMessage}`);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch calendar events
  const fetchEvents = async (accessToken: string) => {
    try {
      setLoading(true);
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 7); // Get events for the next 7 days
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${today.toISOString()}&timeMax=${endDate.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      const data = await response.json();
      
      if (data.error) {
        // Token might be expired
        setToken(null);
        await AsyncStorage.removeItem('google_calendar_token');
        setError('Session expired. Please sign in again.');
      } else if (data.items) {
        setEvents(data.items);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Failed to fetch events: ${errorMessage}`);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatEventTime = (dateTimeString: string) => {
    const date = new Date(dateTimeString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Group events by date
  const groupEventsByDate = (): GroupedEvents => {
    const grouped: GroupedEvents = {};
    
    events.forEach(event => {
      if (!event.start.dateTime) return;
      
      const date = new Date(event.start.dateTime);
      const dateString = date.toDateString();
      
      if (!grouped[dateString]) {
        grouped[dateString] = [];
      }
      
      grouped[dateString].push(event);
    });
    
    return grouped;
  };

  // Only show on desktop platforms
  if (Platform.OS !== 'web') {
    return null;
  }

  const groupedEvents = groupEventsByDate();

  // While the redirect URI is being set up
  if (!redirectUri) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Initializing...</ThemedText>
      </ThemedView>
    );
  }

  if (!token) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>Google Calendar</ThemedText>
        <TouchableOpacity 
          style={styles.signInButton} 
          onPress={signInWithGoogle}
          disabled={loading}
        >
          <ThemedText style={styles.signInText}>
            {loading ? 'Signing in...' : 'Connect Google Calendar'}
          </ThemedText>
        </TouchableOpacity>
        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Upcoming Events</ThemedText>
        <TouchableOpacity onPress={() => fetchEvents(token)}>
          <ThemedText style={styles.refreshButton}>Refresh</ThemedText>
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <ThemedText>Loading events...</ThemedText>
      ) : (
        <ScrollView style={styles.eventsList}>
          {Object.keys(groupedEvents).length === 0 ? (
            <ThemedText style={styles.noEvents}>No upcoming events</ThemedText>
          ) : (
            Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <View key={date} style={styles.dateGroup}>
                <ThemedText style={styles.dateHeader}>{date}</ThemedText>
                {dayEvents.map((event: CalendarEvent) => (
                  <View key={event.id} style={styles.event}>
                    <View style={[styles.eventColor, { backgroundColor: getEventColor(event.colorId) }]} />
                    <View style={styles.eventDetails}>
                      <ThemedText style={styles.eventTitle}>{event.summary}</ThemedText>
                      <ThemedText style={styles.eventTime}>
                        {formatEventTime(event.start.dateTime)} - {formatEventTime(event.end.dateTime)}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
      
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
    </ThemedView>
  );
}

// Helper function to get colors for events
const getEventColor = (colorId: string | undefined) => {
  const colors: Record<string, string> = {
    '1': '#7986CB', // Lavender
    '2': '#33B679', // Sage
    '3': '#8E24AA', // Grape
    '4': '#E67C73', // Flamingo
    '5': '#F6BF26', // Banana
    '6': '#F4511E', // Tangerine
    '7': '#039BE5', // Peacock
    '8': '#616161', // Graphite
    '9': '#3F51B5', // Blueberry
    '10': '#0B8043', // Basil
    '11': '#D50000', // Tomato
  };
  
  return colorId && colors[colorId] ? colors[colorId] : '#4285F4'; // Default blue
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    maxWidth: 350,
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  eventsList: {
    flex: 1,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  event: {
    flexDirection: 'row',
    marginBottom: 8,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  eventColor: {
    width: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  eventDetails: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  eventTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  signInButton: {
    backgroundColor: '#4285F4',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  signInText: {
    color: 'white',
    fontWeight: '500',
  },
  refreshButton: {
    color: '#4285F4',
    fontSize: 14,
  },
  noEvents: {
    marginTop: 20,
    textAlign: 'center',
    color: '#666',
  },
  errorText: {
    color: '#D32F2F',
    marginTop: 10,
  },
}); 