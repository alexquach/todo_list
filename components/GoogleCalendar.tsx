import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Platform, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

// Configuration for Google OAuth
const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET;

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

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',  // Full access to calendars
  // 'https://www.googleapis.com/auth/calendar.readonly' // Remove this read-only scope
];

WebBrowser.maybeCompleteAuthSession();

interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime?: string;
    timeZone?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    timeZone?: string;
    date?: string;
  };
  colorId?: string;
  extendedProperties?: {
    private?: {
      todoId?: string;
      isTodoEvent?: string;
    };
  };
}

type GroupedEvents = {
  [key: string]: CalendarEvent[];
};

// Add helper functions for week view
const getDaysOfWeek = (startDate: Date = new Date()) => {
  const days = [];
  const currentDay = new Date(startDate);
  
  // Calculate days to Monday (getDay returns 0 for Sunday, so we need a different formula)
  // If today is Sunday (0), we need to go back 6 days to get to last Monday
  // For any other day, we go back (day - 1) days
  const daysToMonday = currentDay.getDay() === 0 ? 6 : currentDay.getDay() - 1;
  
  // Set to the start of the week (Monday)
  currentDay.setDate(currentDay.getDate() - daysToMonday);
  
  // Create array of 7 days starting from Monday
  for (let i = 0; i < 7; i++) {
    days.push(new Date(currentDay));
    currentDay.setDate(currentDay.getDate() + 1);
  }
  
  return days;
};

// Modify time slots to show full 24 hours (midnight to midnight)
const getTimeSlots = () => {
  const slots = [];
  // Generate hourly slots for all 24 hours of the day
  for (let hour = 0; hour < 24; hour++) {
    const formattedHour = hour === 0 || hour === 12 ? 12 : hour % 12;
    // Add AM/PM with the right spacing
    slots.push(`${formattedHour} ${hour < 12 ? 'AM' : 'PM'}`);
  }
  return slots;
};

const isSameDay = (date1: Date, date2: Date) => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

// Modified interface for positioned events
interface PositionedEvent extends CalendarEvent {
  top: number;
  height: number;
  left: number;
  width: number;
  column: number;
  columnSpan: number;
}

// Add interface for all-day events
interface GroupedAllDayEvents {
  [key: number]: CalendarEvent[];
}

// We need to define the number of time slots statically for styles
const TIME_SLOTS_COUNT = 24; // Full 24 hours

// Add this constant at the top with other constants
const HEADER_HEIGHT = 60; // Adjust this value to match your header height

// First, update the component interface to handle the draggedTodo
interface GoogleCalendarProps {
  onTodoDrop?: (todoItem: any, date: Date) => void;
  draggedTodo?: TodoItem | null;
  clearDraggedTodo?: () => void;
  onTodoEventMoved?: (todoId: string, newDate: Date) => void; // Add this new prop
}

// Add this near the top of your file with the other interfaces
interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  created_at: string;
  archived: boolean;
  snooze_time: string | null;
}

// Add this EVENT_COLORS constant outside the component
// These should match Google Calendar's color IDs
const EVENT_COLORS: Record<string, { primary: string; light: string }> = {
  '1': { primary: '#4285F4', light: '#4285F4AA' }, // Blue
  '2': { primary: '#33B679', light: '#33B679AA' }, // Green
  '3': { primary: '#F4511E', light: '#F4511EAA' }, // Orange
  '4': { primary: '#8E24AA', light: '#8E24AAAA' }, // Purple
  '5': { primary: '#E67C73', light: '#E67C73AA' }, // Red
  '6': { primary: '#F6BF26', light: '#F6BF26AA' }, // Yellow
  '7': { primary: '#039BE5', light: '#039BE5AA' }, // Light blue
  '8': { primary: '#616161', light: '#616161AA' }, // Gray
  '9': { primary: '#3F51B5', light: '#3F51B5AA' }, // Indigo
  '10': { primary: '#0B8043', light: '#0B8043AA' }, // Dark green
  '11': { primary: '#D50000', light: '#D50000AA' }, // Dark red
};

// Move the getEventColor function outside the component
const getEventColor = (colorId: string | undefined, isAllDay: boolean = false, isTodo: boolean = false) => {
  if (isTodo) {
    // Always use blue for todo-sourced events
    return isAllDay ? '#2196F3AA' : '#2196F3'; // Blue with/without alpha
  }
  
  // Logic for other events
  if (isAllDay) {
    return colorId ? EVENT_COLORS[colorId]?.light || '#9575CDAA' : '#9575CDAA';
  }
  return colorId ? EVENT_COLORS[colorId]?.primary || '#9575CD' : '#9575CD';
};

// Update the getEventBgColor function to match 
const getEventBgColor = (colorId: string | undefined) => {
  // Use the same color as the border but with very low opacity
  const baseColor = getEventColor(colorId);
  
  // Extract the hex color and convert to RGB with alpha
  const hex = baseColor.substring(1);
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Return the color with 10% opacity for a subtle background
  // return `rgba(${r}, ${g}, ${b}, 0.2)`;
  return `rgb(240, 232, 252)`;
};

export default function GoogleCalendar({
  onTodoDrop,
  draggedTodo,
  clearDraggedTodo,
  onTodoEventMoved
}: GoogleCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [allDayEvents, setAllDayEvents] = useState<CalendarEvent[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState<Date[]>(getDaysOfWeek());
  const [isDropTarget, setIsDropTarget] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editEventText, setEditEventText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEventResizing, setIsEventResizing] = useState(false);
  const [resizeData, setResizeData] = useState<{ additionalHours: number }>({ additionalHours: 0 });
  const [resizeStartY, setResizeStartY] = useState<number>(0);
  const [originalEventHeight, setOriginalEventHeight] = useState<number>(0);
  const [temporaryEventHeight, setTemporaryEventHeight] = useState<number>(0);
  const [resizeGhostPosition, setResizeGhostPosition] = useState<{ top: number, height: number, left: number, width: number } | null>(null);
  const [isDraggingEvent, setIsDraggingEvent] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<PositionedEvent | null>(null);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [temporaryEventPosition, setTemporaryEventPosition] = useState({ top: 0, left: 0 });
  const [snappedPosition, setSnappedPosition] = useState({ 
    top: 0, 
    left: 0, 
    width: 0,
    height: 0 
  });
  const gridRef = useRef<View>(null);
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);
  const [todoDropTarget, setTodoDropTarget] = useState<{
    dayIndex: number;
    timePosition?: number;
  } | null>(null);
  const [positionedEvents, setPositionedEvents] = useState<PositionedEvent[]>([]);
  const editingPanelRef = React.useRef(null);
  // Add this to your component state variables
  const [isDragThresholdMet, setIsDragThresholdMet] = useState(false);
  const DRAG_THRESHOLD = 5; // Pixels to move before showing ghost preview
  // Add this to your state variables near the top of your component
  const [ghostPosition, setGhostPosition] = useState<{
    top: number;
    left: number;
    width: number;
    verticalPosition: number;
    dayIndex: number;
  } | null>(null);
  // Add this to your state variables
  const [message, setMessage] = useState<string | null>(null);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(timer);
  }, []);

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
      const storedScope = await AsyncStorage.getItem('google_calendar_scope');
      
      // If we have a token but it was obtained with different scopes, we need to re-authenticate
      if (storedToken && storedScope === SCOPES.join(',')) {
        setToken(storedToken);
        fetchEvents(storedToken);
      } else {
        // Clear existing token if scopes have changed
        await AsyncStorage.removeItem('google_calendar_token');
        setToken(null);
      }
    } catch (e: unknown) {
      console.error('Failed to load token', e);
    }
  };

  // Save token to AsyncStorage
  const saveToken = async (newToken: string) => {
    try {
      await AsyncStorage.setItem('google_calendar_token', newToken);
      await AsyncStorage.setItem('google_calendar_scope', SCOPES.join(','));
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

  // Add this function after signInWithGoogle
  const refreshTokenIfNeeded = async (token: string) => {
    try {
      // Parse the token to check expiration
      const tokenData = JSON.parse(atob(token.split('.')[1]));
      const expiryTime = tokenData.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      
      // If token will expire in less than 5 minutes, refresh it
      if (expiryTime - currentTime < 5 * 60 * 1000) {
        console.log('Token about to expire, refreshing...');
        await signInWithGoogle();
        return true; // Token was refreshed
      }
      return false; // No refresh needed
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return false;
    }
  };

  // Handle navigation between weeks
  const navigateWeek = (direction: number, silentRefresh = false) => {
    const newStartDate = new Date(currentWeek[0]);
    newStartDate.setDate(newStartDate.getDate() + (7 * direction));
    const newWeek = getDaysOfWeek(newStartDate);
    
    // Set the new current week
    setCurrentWeek(newWeek);
    
    // If we have a token, fetch events for the new week
    // Pass newWeek directly to fetchEvents instead of relying on the state update
    if (token) {
      // Modify fetchEvents call to pass the new week directly
      fetchEventsForWeek(token, newWeek, silentRefresh);
    }
  };

  // Add a new function that takes the week as a parameter
  const fetchEventsForWeek = async (accessToken: string, week: Date[], silentRefresh = false) => {
    try {
      // Check if token needs refresh before making request
      const wasRefreshed = await refreshTokenIfNeeded(accessToken);
      if (wasRefreshed) {
        // Token was refreshed, use the new one from storage
        const newToken = await loadToken();
        if (newToken) {
          accessToken = newToken;
        }
      }
      
      // Continue with existing fetch logic
      if (!silentRefresh) {
        setLoading(true);
      }
      
      // Use the provided week instead of currentWeek state
      const startDate = new Date(week[0]);
      const endDate = new Date(week[6]);
      endDate.setHours(23, 59, 59);

      console.log('Fetching events for date range:', startDate.toISOString(), 'to', endDate.toISOString());
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startDate.toISOString()}&timeMax=${endDate.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      // Rest of the fetch logic remains the same
      const data = await response.json();
      
      if (data.error) {
        // Token might be expired
        setToken(null);
        await AsyncStorage.removeItem('google_calendar_token');
        setError('Session expired. Please sign in again.');
      } else if (data.items) {
        // Separate all-day events from regular events
        const regularEvents: CalendarEvent[] = [];
        const allDayEvts: CalendarEvent[] = [];
        
        data.items.forEach((item: CalendarEvent) => {
          // Check if the event is an all-day event
          if (item.start?.date) {
            allDayEvts.push(item);
          } else if (item.start?.dateTime) {
            regularEvents.push(item);
          }
        });
        
        setEvents(regularEvents);
        setAllDayEvents(allDayEvts);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Failed to fetch events: ${errorMessage}`);
      console.error(e);
    } finally {
      if (!silentRefresh) {
        setLoading(false); // Only update loading state if not silent
      }
    }
  };

  // Update the original fetchEvents to use the new function
  const fetchEvents = async (accessToken: string, silentRefresh = false) => {
    // Just pass the current week from state
    fetchEventsForWeek(accessToken, currentWeek, silentRefresh);
  };

  // Format the month and year like in Notion
  const formatMonthYear = () => {
    const currentMonth = currentWeek[0].toLocaleString('en-US', { month: 'long' });
    const currentYear = currentWeek[0].getFullYear();
    return `${currentMonth} ${currentYear}`;
  };

  // Format date for display
  const formatEventTime = (dateTimeString: string | undefined) => {
    if (!dateTimeString) return '';
    
    const date = new Date(dateTimeString);
    let formattedTime = date.toLocaleTimeString([], { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    // Remove :00 for whole hours and make AM/PM shorter
    formattedTime = formattedTime
      .replace(':00', '')
      .replace(' AM', 'a')
      .replace(' PM', 'p');
      
    return formattedTime;
  };

  // Group events by date
  const groupEventsByDate = (): GroupedEvents => {
    const grouped: GroupedEvents = {};
    
    events.forEach(event => {
      if (!event.start?.dateTime) return;
      
      const date = new Date(event.start.dateTime);
      const dateString = date.toDateString();
      
      if (!grouped[dateString]) {
        grouped[dateString] = [];
      }
      
      grouped[dateString].push(event);
    });
    
    return grouped;
  };

  // Calculate positions for events in the week view
  const getPositionedEvents = (): PositionedEvent[] => {
    if (!events.length) return [];
    
    const positioned: PositionedEvent[] = [];
    const hourHeight = 60; // Height for one hour in pixels
    const dayWidth = 100; // Width for one day column
    
    const eventsByDay: { [key: number]: CalendarEvent[] } = {};
    
    // Group events by day of week (0-6)
    events.forEach(event => {
      if (!event.start?.dateTime) return;
      
      const startDate = new Date(event.start.dateTime);
      const dayIndex = currentWeek.findIndex(day => isSameDay(day, startDate));
      
      if (dayIndex >= 0) {
        if (!eventsByDay[dayIndex]) {
          eventsByDay[dayIndex] = [];
        }
        eventsByDay[dayIndex].push(event);
      }
    });
    
    // Position events within each day column
    Object.entries(eventsByDay).forEach(([dayIndexStr, dayEvents]) => {
      const dayIndex = parseInt(dayIndexStr);
      
      // Sort events by start time
      dayEvents.sort((a, b) => {
        const aTime = a.start.dateTime ? new Date(a.start.dateTime).getTime() : 0;
        const bTime = b.start.dateTime ? new Date(b.start.dateTime).getTime() : 0;
        return aTime - bTime;
      });
      
      // Position each event
      dayEvents.forEach(event => {
        if (!event.start.dateTime || !event.end.dateTime) {
          // Skip all-day events or events without proper time information
          return;
        }
        
        const startTime = new Date(event.start.dateTime);
        const endTime = new Date(event.end.dateTime);
        
        // Calculate position relative to midnight (0 AM)
        const startHour = startTime.getHours() + startTime.getMinutes() / 60;
        const endHour = endTime.getHours() + endTime.getMinutes() / 60;
        const top = startHour * hourHeight;
        const height = (endHour - startHour) * hourHeight;
        
        positioned.push({
          ...event,
          top,
          height: Math.max(height, 30), // Maintain minimum height of 30
          left: dayIndex * (100 / 7), // Use numeric calculation 
          width: (100 / 7), // Use numeric calculation
          column: dayIndex,
          columnSpan: 1 // Default to spanning 1 column
        });
      });
    });
    
    return positioned;
  };

  // Add function to create an event from a todo item
  const createEventFromTodo = async (todoItem: TodoItem, dropDate: Date) => {
    if (!token) {
      console.error('No access token available');
      return;
    }

    try {
      // Create start and end times from the drop date
      // Default to a 1-hour event
      const startDateTime = new Date(dropDate);
      const endDateTime = new Date(dropDate);
      endDateTime.setHours(endDateTime.getHours() + 1);

      // Format for the API request
      const startTime = startDateTime.toISOString();
      const endTime = endDateTime.toISOString();

      // Create the event with a blue color (colorId: 1 is typically blue in Google Calendar)
      // You might need to adjust the colorId based on your calendar settings
      const eventData = {
        summary: todoItem.text,
        description: `Todo item from your list (ID: ${todoItem.id})`,
        start: {
          dateTime: startTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: endTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        colorId: '1', // 1 is typically blue in Google Calendar
        // You can add a special marker to identify this as a todo-sourced event
        extendedProperties: {
          private: {
            todoId: todoItem.id,
            isTodoEvent: 'true'
          }
        }
      };

      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(eventData)
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create event: ${response.status}`);
      }

      const createdEvent = await response.json();
      console.log('Created event:', createdEvent);

      // Refresh events list to show the new event
      fetchEvents(token);
      
      return createdEvent;
    } catch (error) {
      console.error('Error creating event from todo:', error);
      setError('Failed to create event. Please try again.');
    }
  };

  // Enhanced handleDrop to create events at specific times
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, verticalPosition?: number) => {
    e.preventDefault();
    
    console.log('Calendar drop event detected:', {
      dayIndex,
      verticalPosition,
      dataTransferTypes: e.dataTransfer.types,
    });
    
    // Reset visual states
    setIsDropTarget(null);
    setTodoDropTarget(null);
    
    try {
      // Get the todo item from dragged data
      const todoText = e.dataTransfer.getData('text/plain');
      console.log('Dropped todo text:', todoText);
      
      if (!todoText || !onTodoDrop) {
        console.warn('Drop ignored - missing todoText or onTodoDrop handler', {
          hasTodoText: !!todoText,
          hasHandler: !!onTodoDrop
        });
        return;
      }
      
      // Create a date for this drop position
      const days = getDaysOfWeek(currentWeek[0]); // Use first day of current week
      const dropDate = new Date(days[dayIndex]);
      
      // If we have a vertical position, use it to set the time
      if (verticalPosition !== undefined) {
        const hour = Math.floor(verticalPosition / 60);
        const minute = Math.round((verticalPosition % 60) / 15) * 15;
        
        dropDate.setHours(hour, minute, 0, 0);
        console.log(`Setting time to ${hour}:${minute} based on vertical position ${verticalPosition}`);
      } else {
        // Default to noon if dropped on day header
        dropDate.setHours(12, 0, 0, 0);
        console.log('No vertical position, defaulting to noon');
      }
      
      console.log('Calling onTodoDrop with:', {todoText, dropDate: dropDate.toISOString()});
      onTodoDrop(todoText, dropDate);
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  // Handle drag over to show ghost element
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, dayIndex: number) => {
    e.preventDefault();
    
    // Very basic debugging to see the event is registered
    console.log(`Drag over day ${dayIndex}`, {
      x: e.clientX, 
      y: e.clientY,
      types: Array.from(e.dataTransfer.types)
    });
    
    // Track the drop target for visual feedback
    setIsDropTarget(dayIndex);
    
    // If it has the grid element, calculate vertical position
    const gridElement = gridRef.current;
    if (!gridElement) {
      console.error("Grid element not found");
      return;
    }
    
    // Get the bounding rectangle of the grid
    const rect = gridElement.getBoundingClientRect();
    
    // Calculate vertical position relative to the grid
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const relativeY = e.clientY - rect.top;
      
      // Convert to hours (assuming 60px per hour)
      const hourHeight = 60;
      const hours = relativeY / hourHeight;
      
      // Snap to 15-minute intervals (0.25 hours)
      const snapToQuarterHour = Math.round(hours * 4) / 4;
      const snapPosition = snapToQuarterHour * hourHeight;
      
      setTodoDropTarget({
        dayIndex,
        timePosition: snapPosition
      });
      
      console.log('Drop target calculated:', {
        dayIndex,
        relativeY,
        snapPosition
      });
    }
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setTodoDropTarget(null);
    setIsDropTarget(null);
  };

  // Group all-day events by day of week
  const getAllDayEventsByDay = (): GroupedAllDayEvents => {
    const grouped: GroupedAllDayEvents = {};
    
    allDayEvents.forEach(event => {
      // Handle events with date property (all-day events)
      if (!event.start?.date) return;
      
      // Create date object - note: all-day events in Google Calendar API 
      // use UTC dates, so we need to parse them properly to avoid timezone issues
      const dateString = event.start.date;
      
      // Parse YYYY-MM-DD format without considering timezone
      const [year, month, day] = dateString.split('-').map(n => parseInt(n, 10));
      const startDate = new Date(year, month - 1, day); // Month is 0-indexed in JS Date
      
      // Find which day of the current week this event belongs to
      for (let i = 0; i < currentWeek.length; i++) {
        if (isSameDay(currentWeek[i], startDate)) {
          if (!grouped[i]) {
            grouped[i] = [];
          }
          grouped[i].push(event);
          break;
        }
      }
    });
    
    return grouped;
  };

  // Calculate position for current time indicator
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Position is based on hours and minutes from midnight
    return (hours + minutes / 60) * 60; // 60px per hour
  };

  // Get current day column index (0-6)
  const getCurrentDayColumn = () => {
    const today = new Date();
    return currentWeek.findIndex(day => isSameDay(day, today));
  };

  // Modify the updateEvent function to use a separate loading state
  const updateEvent = async (eventId: string, updates: Partial<CalendarEvent>): Promise<void> => {
    if (!token) {
      console.error('No access token available');
      return Promise.reject('No access token');
    }
    
    try {
      // First, get the current event to make sure we have all fields
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch event: ${response.status}`);
      }
      
      const currentEvent = await response.json();
      
      // Merge the current event with our updates
      const updatedEvent = {
        ...currentEvent,
        ...updates,
        // Make sure nested objects are properly merged
        end: {
          ...currentEvent.end,
          ...(updates.end || {})
        },
        start: {
          ...currentEvent.start,
          ...(updates.start || {})
        }
      };
      
      // Send the update to the API
      const updateResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedEvent)
        }
      );
      
      if (!updateResponse.ok) {
        throw new Error(`Failed to update event: ${updateResponse.status}`);
      }
      
      // Return the updated event
      const result = await updateResponse.json();
      console.log('Event updated successfully:', result);
      
      // Show success feedback to the user
      // This could be a toast notification or other UI feedback
      return Promise.resolve();
    } catch (error) {
      console.error('Error updating event:', error);
      return Promise.reject(error);
    }
  };

  // Do the same for deleteEvent
  const deleteEvent = async (eventId: string) => {
    if (!token) return;
    
    try {
      setIsUpdatingEvent(true);
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to delete event: ${response.statusText}`);
      }
      
      // Silently refresh events without showing loading overlay
      fetchEvents(token, true);
      
      // Clear editing state
      setShowDeleteConfirm(false);
      setEditingEvent(null);
      setEditEventText('');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Failed to delete event: ${errorMessage}`);
      console.error(e);
    } finally {
      setIsUpdatingEvent(false);
    }
  };

  // Add function to start resizing an event
  const startResizeEvent = (event: PositionedEvent, clientY: number) => {
    setIsEventResizing(true);
    setEditingEvent(event);
    setResizeStartY(clientY);
    setOriginalEventHeight(event.height);
    setTemporaryEventHeight(event.height);
    
    // Initialize resize ghost position
    setResizeGhostPosition({
      top: event.top,
      height: event.height,
      left: event.left,
      width: event.width
    });
    
    // Initialize resize data
    setResizeData({ additionalHours: 0 });
  };

  // Update the handleResizeMove function with better logging
  const handleResizeMove = (clientY: number) => {
    if (!isEventResizing || !editingEvent) return;
    
    const deltaY = clientY - resizeStartY;
    console.log('Raw delta Y:', deltaY);
    
    // 15 minutes = 15px at hourHeight of 60px
    const snapInterval = 15; // 15 minutes
    const pixelsPerMinute = 60 / 60; // hourHeight / minutes in hour
    const snapPixels = snapInterval * pixelsPerMinute; // pixels for 15 minutes
    
    // Snap to nearest 15-minute interval
    const snappedDeltaY = Math.round(deltaY / snapPixels) * snapPixels;
    console.log('Snapped delta Y:', snappedDeltaY);
    
    const newHeight = Math.max(30, originalEventHeight + snappedDeltaY);
    setTemporaryEventHeight(newHeight);
    
    // Calculate additional hours based on delta height
    const hourHeight = 60; // Height for one hour in pixels
    const additionalHours = snappedDeltaY / hourHeight;
    console.log('Calculated additionalHours:', additionalHours);
    
    // Update the ghost position
    if (resizeGhostPosition) {
      setResizeGhostPosition({
        ...resizeGhostPosition,
        height: newHeight
      });
    }
    
    // Update resize data - using a separate call to ensure it's registered
    console.log('Setting resizeData.additionalHours to:', additionalHours);
    setResizeData({ additionalHours });
  };

  // Update the finishResizeEvent function 
  const finishResizeEvent = () => {
    console.log('finishResizeEvent called');
    if (!isEventResizing || !editingEvent) {
      console.log('Early return - isEventResizing:', isEventResizing, 'editingEvent:', !!editingEvent);
      return;
    }
    
    // Calculate the additionalHours directly from current heights
    // This ensures we don't rely on possibly stale resizeData
    const currentAdditionalHeight = temporaryEventHeight - originalEventHeight;
    const hourHeight = 60; // Height for one hour in pixels
    const currentAdditionalHours = currentAdditionalHeight / hourHeight;
    
    console.log('Current values:');
    console.log('- From resizeData:', resizeData.additionalHours);
    console.log('- Calculated from heights:', currentAdditionalHours);
    console.log('- temporaryEventHeight:', temporaryEventHeight);
    console.log('- originalEventHeight:', originalEventHeight);
    
    // Use the calculated value to be sure
    const additionalHours = currentAdditionalHours;
    
    // Only update if changed (any 15-minute increment is significant enough)
    if (Math.abs(additionalHours) > 0.01) {
      console.log('Updating event with additionalHours:', additionalHours);
      
      // Get current end time
      const currentEndTime = editingEvent.end.dateTime ? new Date(editingEvent.end.dateTime) : new Date();
      
      // Add the additional time
      const newEndTime = new Date(currentEndTime.getTime() + (additionalHours * 60 * 60 * 1000));
      
      // Format the time in ISO format for the API
      const formattedEndTime = newEndTime.toISOString();
      
      // Update the event in the API
      updateEvent(editingEvent.id, {
        end: {
          dateTime: formattedEndTime,
          timeZone: editingEvent.end.timeZone
        }
      }).then(() => {
        console.log('Event updated successfully with new end time:', formatEventTime(formattedEndTime));
        
        // Update the local state to reflect the changes
        setEvents(prevEvents => 
          prevEvents.map(event => 
            event.id === editingEvent.id 
              ? {
                  ...event,
                  end: {
                    ...event.end,
                    dateTime: formattedEndTime
                  }
                } 
              : event
          )
        );
        
        // Re-calculate positioned events based on updated data
        const positioned = getPositionedEvents();
        setPositionedEvents(positioned);
      })
      .catch(error => {
        console.error('Failed to update event:', error);
        // Reset the UI if the API call fails
        const originalPositioned = getPositionedEvents();
        setPositionedEvents(originalPositioned);
      });
    } else {
      console.log('No significant change detected, skipping update');
    }
    
    // Reset resize state
    setIsEventResizing(false);
    setResizeData({ additionalHours: 0 });
    setResizeGhostPosition(null);
    
    // Don't clear the editing event since we're using a bottom panel now
    // This allows users to continue editing the same event
    // setEditingEvent(null);
  };

  // Update startDragEvent to initialize the threshold state
  const startDragEvent = (event: PositionedEvent, clientX: number, clientY: number) => {
    console.log('Starting drag operation for event:', event.summary);
    
    // Clean up any existing resize state first
    if (isEventResizing) {
      setIsEventResizing(false);
      setResizeGhostPosition(null);
    }
    
    // Set drag-specific state
    setIsDraggingEvent(true);
    setIsDragThresholdMet(false); // Start with threshold not met
    setDraggedEvent(event);
    setDragStartY(clientY);
    setDragStartX(clientX);
    setEditingEvent(event); // Keep the event selected while dragging
    
    // Calculate the offset within the event where the drag started
    const eventRect = document.getElementById(`event-${event.id}`)?.getBoundingClientRect();
    if (eventRect) {
      setDragOffsetY(clientY - eventRect.top);
    }
    
    // Set initial temporary position
    setTemporaryEventPosition({
      top: event.top,
      left: event.left
    });
    
    // Initialize snapped position
    setSnappedPosition({
      top: event.top,
      left: event.left,
      width: event.width,
      height: event.height
    });
  };

  // Update finishDragEvent to reset the threshold state
  const finishDragEvent = () => {
    if (draggedEvent && !isUpdatingEvent) {
      setIsUpdatingEvent(true); // Show loading indicator
      
      // Calculate the new column (day) from the snapped position percentage
      const newColumn = Math.round(snappedPosition.left / (100/7));
      
      // Calculate the new start and end times
      const startDateTime = new Date(currentWeek[newColumn]); // Use newColumn instead of draggedEvent.column
      
      // Set hours and minutes based on vertical position
      const hours = Math.floor(snappedPosition.top / 60);
      const minutes = Math.round((snappedPosition.top % 60) / 15) * 15; // Snap to 15-min intervals
      startDateTime.setHours(hours, minutes, 0, 0);
      
      // Calculate duration of original event (in minutes)
      const durationMinutes = draggedEvent.height / 60 * 60;
      
      // Set end time based on duration
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(startDateTime.getMinutes() + durationMinutes);
      
      // Format the dates for Google Calendar API
      const formattedStart = startDateTime.toISOString();
      const formattedEnd = endDateTime.toISOString();
      
      // Check if this is a todo-linked event
      const isTodo = isTodoEvent(draggedEvent);
      const todoId = draggedEvent.extendedProperties?.private?.todoId;
      
      console.log('Updating event:', {
        id: draggedEvent.id,
        from: {
          column: draggedEvent.column,
          date: new Date(currentWeek[draggedEvent.column]).toDateString(),
          top: draggedEvent.top
        },
        to: {
          column: newColumn,
          date: startDateTime.toDateString(),
          top: snappedPosition.top
        }
      });
      
      // Update the event in Google Calendar
      updateEvent(draggedEvent.id, {
        start: {
          dateTime: formattedStart,
          timeZone: draggedEvent.start.timeZone
        },
        end: {
          dateTime: formattedEnd,
          timeZone: draggedEvent.end.timeZone
        }
      }).then(() => {
        console.log('Event updated successfully after drag');
        
        // If this is a todo-linked event and we have the callback, update the todo
        if (isTodo && todoId && onTodoEventMoved) {
          onTodoEventMoved(todoId, startDateTime);
        }
        
        // Refresh events
        if (token) {
          fetchEvents(token, true);
        }
      }).catch(error => {
        console.error('Failed to update event after drag:', error);
      }).finally(() => {
        setIsUpdatingEvent(false); // Hide loading indicator
      });
    }
    
    // Reset drag state
    setIsDraggingEvent(false);
    setDraggedEvent(null);
    setTemporaryEventPosition({ top: 0, left: 0 });
    setSnappedPosition({ top: 0, left: 0, width: 0, height: 0 });
  };

  // Update handleDragMove to include drag threshold check
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingEvent || !draggedEvent) return;

    // Calculate raw delta from the starting position
    const deltaY = clientY - dragStartY;
    const deltaX = clientX - dragStartX;
    
    // Check if we've moved enough to show the ghost
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const thresholdMet = distance > DRAG_THRESHOLD;
    
    // Update threshold state if needed
    if (thresholdMet !== isDragThresholdMet) {
      setIsDragThresholdMet(thresholdMet);
    }
    
    // For vertical position: snap to 15-minute intervals
    const hourHeight = 60; // Height for one hour in pixels
    const snapInterval = 15; // 15 minutes
    const pixelsPerMinute = hourHeight / 60; // 1 pixel per minute
    const snapPixels = snapInterval * pixelsPerMinute; // Pixels for 15 minutes
    
    // Get starting top position and add deltaY
    const rawNewTop = draggedEvent.top + deltaY;
    
    // Snap to nearest 15-minute interval
    const snappedTop = Math.round(rawNewTop / snapPixels) * snapPixels;
    
    // For horizontal position: snap to day columns
    const gridElement = gridRef.current;
    let newLeft = draggedEvent.left; // Default to current position
    let newColumn = draggedEvent.column; // Track column for logging
    
    if (gridElement && typeof window !== 'undefined') {
      // Get the grid's dimensions
      const rect = gridElement.getBoundingClientRect?.() || { top: 0, left: 0, width: 0, height: 0 };
      const gridWidth = rect.width;
      
      // Calculate the absolute position within the grid
      const relativeX = clientX - rect.left;
      
      // Calculate which column (day) this position corresponds to
      const dayIndex = Math.floor(relativeX / (gridWidth / 7));
      
      // Constrain to valid column range (0-6)
      const constrainedDayIndex = Math.max(0, Math.min(6, dayIndex));
      newColumn = constrainedDayIndex;
      
      // Convert back to percentage position
      newLeft = constrainedDayIndex * (100 / 7);
      
      // Add visual indicator text for the day being dragged to
      if (thresholdMet && newColumn !== draggedEvent.column) {
        console.log(`Dragging to ${currentWeek[newColumn].toDateString()} (column ${newColumn})`);
      }
    }
    
    // Update temporary position for visual feedback
    setTemporaryEventPosition({
      top: snappedTop,
      left: newLeft
    });
    
    // Also update the snapped position for use in finishDragEvent
    setSnappedPosition({
      top: snappedTop,
      left: newLeft,
      width: draggedEvent.width,
      height: draggedEvent.height
    });
  };

  // Add global event handlers for dragging
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleMouseMove = (e: MouseEvent) => {
        if (isDraggingEvent) {
          handleDragMove(e.clientX, e.clientY);
        } else if (isEventResizing) {
          handleResizeMove(e.clientY);
        }
      };
      
      const handleMouseUp = () => {
        if (isDraggingEvent) {
          finishDragEvent();
        } else if (isEventResizing) {
          finishResizeEvent();
        }
      };
      
      // Add global event listeners
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [
    isDraggingEvent, 
    isEventResizing, 
    draggedEvent, 
    dragStartY, 
    dragStartX, 
    dragOffsetY, 
    temporaryEventPosition,
    resizeData, 
    temporaryEventHeight, 
    originalEventHeight,
    isDragThresholdMet, // Add this dependency
  ]);

  // Keep just the useEffect that updates positioned events
  useEffect(() => {
    // Update positioned events when events change
    const positioned = getPositionedEvents();
    setPositionedEvents(positioned);
  }, [events, currentWeek]);

  // Add this at the component level to track state changes
  useEffect(() => {
    console.log("Drag state changed:", { isDraggingEvent, draggedEvent: draggedEvent?.id });
  }, [isDraggingEvent, draggedEvent]);

  useEffect(() => {
    console.log("Resize state changed:", { isEventResizing, editingEvent: editingEvent?.id });
  }, [isEventResizing, editingEvent]);

  // Add this function to handle background clicks
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If we have an editing event and the click target is not an event element
    if (editingEvent && e.target instanceof HTMLElement) {
      // Check if the click was on an event or inside the editing panel
      const clickedOnEvent = e.target.closest('.calendar-event');
      const clickedOnPanel = e.target.closest('.event-editing-panel');
      
      // If click was not on an event and not in the editing panel, close the panel
      if (!clickedOnEvent && !clickedOnPanel) {
        setEditingEvent(null);
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        }
      }
    }
  };

  // Only show on desktop platforms
  if (Platform.OS !== 'web') {
    return null;
  }

  const timeSlots = getTimeSlots();

  // Custom style with dynamic height
  const timeGridStyle = {
    ...styles.timeGrid,
    height: timeSlots.length * 60
  };

  // When setting up the editing state, ensure default value is empty string
  const setEventForEditing = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEditEventText(event.summary || ''); // Add fallback to empty string
    setShowDeleteConfirm(false);
  };

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

  // Add this to your render function to show the ghost element when dragging
  const renderDragGhost = () => {
    if (!draggedTodo || !ghostPosition) return null;

    // Calculate time from position with 15-minute snapping
    const hours = Math.floor(ghostPosition.verticalPosition / 4); // 4 slots per hour
    const minutes = (ghostPosition.verticalPosition % 4) * 15;
    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return (
      <View
        style={[
          styles.eventGhost,
          {
            top: ghostPosition.top,
            left: ghostPosition.left,
            width: ghostPosition.width,
            height: 60, // Default to 1 hour
            backgroundColor: 'rgba(76, 175, 80, 0.5)', // Semi-transparent green
            borderColor: '#4CAF50',
            borderWidth: 1,
            borderRadius: 4,
          },
        ]}
      >
        <ThemedText style={styles.ghostText}>{draggedTodo.text}</ThemedText>
        <ThemedText style={styles.ghostTime}>{formattedTime}</ThemedText>
      </View>
    );
  };

  // Update the calendar grid mouse move handler
  const handleGridMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggedTodo || !gridRef.current) return;
    
    // Use gridRef.current instead of gridElement
    const gridElement = gridRef.current as any; // Use any to bypass TypeScript check
    
    // Get the grid's dimensions - we need to cast to HTMLElement for web APIs
    const rect = gridElement.getBoundingClientRect?.() || { top: 0, left: 0, width: 0, height: 0 };
    const dayWidth = rect.width / 7; // 7 days per week
    const slotHeight = (rect.height - HEADER_HEIGHT) / (24 * 4); // 15-minute slots
    
    // Calculate which day column the mouse is over
    const dayIndex = Math.floor((e.clientX - rect.left) / dayWidth);
    
    // Calculate the vertical position in 15-minute slots
    let verticalPosition = Math.floor((e.clientY - rect.top - HEADER_HEIGHT) / slotHeight);
    
    // Ensure the vertical position is valid
    verticalPosition = Math.max(0, Math.min(24 * 4 - 1, verticalPosition));
    
    // Calculate the visual position
    const top = HEADER_HEIGHT + verticalPosition * slotHeight;
    const left = dayIndex * dayWidth;
    
    // Update the ghost position
    setGhostPosition({
      top,
      left,
      width: dayWidth,
      verticalPosition,
      dayIndex
    });
  };

  // Add this function to handle clicks on the calendar grid
  const handleGridClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggedTodo || !ghostPosition || !onTodoDrop) return;
    
    // Create a date object for the clicked position
    const days = getDaysOfWeek(currentWeek[0]);
    const clickedDate = new Date(days[ghostPosition.dayIndex]);
    
    // Set the hours and minutes based on ghost position
    const hours = Math.floor(ghostPosition.verticalPosition / 4);
    const minutes = (ghostPosition.verticalPosition % 4) * 15;
    clickedDate.setHours(hours, minutes, 0, 0);
    
    try {
      // First create the Google Calendar event
      const createdEvent = await createEventFromTodo(draggedTodo, clickedDate);
      
      if (createdEvent) {
        // If successful, call the parent component's onTodoDrop function
        onTodoDrop(draggedTodo, clickedDate);
        
        // Show success message (optional)
        setMessage('Todo added to calendar successfully');
        setTimeout(() => setMessage(null), 3000); // Clear message after 3 seconds
      }
    } catch (error) {
      console.error('Failed to add todo to calendar:', error);
      // You might want to show an error message to the user
    }
    
    // Clear the ghost position and dragged todo
    setGhostPosition(null);
    if (clearDraggedTodo) clearDraggedTodo();
  };

  // Add or update this function to check for todo events
  const isTodoEvent = (event: CalendarEvent): boolean => {
    return event.extendedProperties?.private?.isTodoEvent === 'true';
  };

  // Add a goToToday function to navigate to the current week
  const goToToday = (silentRefresh = false) => {
    // Get the days for the current week
    const todayWeek = getDaysOfWeek();
    
    // Set the current week state
    setCurrentWeek(todayWeek);
    
    // If we have a token, fetch events for the new week directly
    if (token) {
      fetchEventsForWeek(token, todayWeek, silentRefresh);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header with Month/Year and Navigation */}
      <View style={styles.header}>
        <ThemedText style={styles.monthYearTitle}>{formatMonthYear()}</ThemedText>
        <View style={styles.headerControls}>
          <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.navButton}>
            <ThemedText style={styles.navButtonText}>←</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => goToToday()} style={styles.todayButton}>
            <ThemedText style={styles.todayButtonText}>Today</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.navButton}>
            <ThemedText style={styles.navButtonText}>→</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => fetchEvents(token)} style={styles.refreshButton}>
            <ThemedText style={styles.navButtonText}>↻</ThemedText>
          </TouchableOpacity>
          
          {/* Add loading indicator that shows during updates */}
          {isUpdatingEvent && (
            <View style={styles.updateIndicator}>
              <ThemedText style={styles.updateIndicatorText}>Updating...</ThemedText>
            </View>
          )}
        </View>
      </View>
      
      {/* Always show the calendar, even during initial loading */}
      <View 
        style={styles.calendarWrapper}
        {...(Platform.OS === 'web' ? {
          // @ts-ignore - Web-only prop
          onClick: handleBackgroundClick
        } : {})}
      >
        {/* Time zones row */}
        <View style={styles.timeZoneRow}>
          <View style={styles.timeColumnHeader} />
          <ThemedText style={styles.timeZoneText}>PDT</ThemedText>
          <ThemedText style={styles.timeZoneText}>EDT</ThemedText>
        </View>
        
        {/* Day Headers */}
        <View style={styles.dayHeaders}>
          <View style={styles.timeColumnHeader} />
          {currentWeek.map((day, index) => (
            <View 
              key={`day-${index}`} 
              style={[
                styles.dayHeader,
                index === 0 && styles.firstDayHeader
              ]}
            >
              <ThemedText style={styles.dayName}>
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </ThemedText>
              <View style={styles.dayNumberContainer}>
                <ThemedText 
                  style={[
                    styles.dayNumber,
                    isSameDay(day, new Date()) && styles.todayNumberText
                  ]}
                >
                  {day.getDate()}
                </ThemedText>
                {isSameDay(day, new Date()) && (
                  <View style={styles.todayCircle} />
                )}
              </View>
              {Platform.OS === 'web' && (
                <div 
                  style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
                  onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                    e.preventDefault();
                    setIsDropTarget(index);
                  }}
                  onDragLeave={() => setIsDropTarget(null)}
                  onDrop={(e: React.DragEvent<HTMLDivElement>) => handleDrop(e, index)}
                />
              )}
            </View>
          ))}
        </View>
        
        {/* All-day events row */}
        <View style={styles.allDayRow}>
          <View style={styles.allDayLabel}>
            <ThemedText style={styles.allDayText}>All-day</ThemedText>
          </View>
          <View style={styles.allDayEventsContainer}>
            {Object.entries(getAllDayEventsByDay()).map(([dayIndex, events]: [string, CalendarEvent[]]) => 
              events.map((event: CalendarEvent, eventIndex: number) => (
                <View 
                  key={`allday-${event.id}-${eventIndex}`} 
                  style={[
                    styles.allDayEvent, 
                    { 
                      backgroundColor: getEventColor(event.colorId, true, isTodoEvent(event)),
                      left: `${parseInt(dayIndex) * 14.285}%`, 
                      width: '14.285%' 
                    }
                  ]}
                >
                  <ThemedText style={styles.allDayEventText}>{event.summary}</ThemedText>
                </View>
              ))
            )}
          </View>
        </View>
        
        {/* Scrollable Content */}
        <ScrollView style={styles.scrollContainer}>
          <View style={timeGridStyle}>
            {/* Time Labels */}
            <View style={styles.timeLabels}>
              {timeSlots.map((time, index) => (
                <View key={`time-${index}`} style={styles.timeLabel}>
                  <ThemedText style={styles.timeLabelText}>{time}</ThemedText>
                </View>
              ))}
            </View>
            
            {/* Grid Content */}
            <View 
              ref={gridRef}
              style={styles.calendarGrid}
              {...(Platform.OS === 'web' ? {
                // @ts-ignore - The following props only exist on web
                onMouseMove: handleGridMouseMove,
                onMouseLeave: () => setGhostPosition(null),
                onClick: handleGridClick
              } : {})}
            >
              {/* Horizontal hour lines */}
              {timeSlots.map((_, index) => (
                <View key={`line-${index}`} style={styles.hourLine} />
              ))}
              
              {/* Day columns with drop zones */}
              {currentWeek.map((_, index) => (
                <div
                  key={`dropzone-${index}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${(index * 14.285).toFixed(3)}%`,
                    width: '14.285%',
                    pointerEvents: 'all', // Make sure this element captures events
                    zIndex: 1
                  }}
                  onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                    handleDragOver(e, index);
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                    // Handle drop with time position
                    if (todoDropTarget && todoDropTarget.dayIndex === index) {
                      handleDrop(e, index, todoDropTarget.timePosition);
                    }
                  }}
                />
              ))}
              
              {/* Todo ghost element */}
              {todoDropTarget && (
                <View
                  style={[
                    styles.eventGhost,
                    {
                      top: todoDropTarget.timePosition,
                      height: 30, // 30 minutes = 30px
                      left: `${todoDropTarget.dayIndex * 14.285}%`,
                      width: '13.285%', // Slightly narrower than column
                      borderLeftColor: '#4285F4', // Google blue for todos
                      borderLeftWidth: 4,
                      backgroundColor: 'rgba(66, 133, 244, 0.1)', // Light blue
                      opacity: 1
                    }
                  ]}
                >
                  <ThemedText style={styles.ghostText}>New event from todo</ThemedText>
                </View>
              )}
              
              {/* Current time indicator */}
              {getCurrentDayColumn() >= 0 && (
                <View 
                  style={[
                    styles.currentTimeIndicator,
                    {
                      top: getCurrentTimePosition(),
                      left: 0,
                      width: '100%'
                    }
                  ]}
                >
                  <View style={styles.currentTimeDot} />
                </View>
              )}
              
              {/* Ghost element - ONLY show during resize operations */}
              {isEventResizing && !isDraggingEvent && resizeGhostPosition && editingEvent && (
                <View
                  style={[
                    styles.event,
                    styles.ghostEvent,
                    {
                      position: 'absolute',
                      top: resizeGhostPosition.top,
                      height: resizeGhostPosition.height,
                      left: `${resizeGhostPosition.left}%`,
                      width: `${resizeGhostPosition.width}%`,
                      backgroundColor: 'rgba(100, 150, 255, 0.3)',
                      borderColor: 'rgba(100, 150, 255, 0.8)',
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      zIndex: 10,
                      pointerEvents: 'none' as any,
                    }
                  ]}
                >
                  <ThemedText style={styles.ghostText}>
                    {editingEvent.summary} • {formatEventTime(editingEvent.start.dateTime)} - 
                    {formatEventTime(
                      editingEvent.end.dateTime 
                        ? new Date(
                            new Date(editingEvent.end.dateTime).getTime() + 
                            (resizeData.additionalHours * 60 * 60 * 1000)
                          ).toISOString()
                        : undefined
                    )}
                  </ThemedText>
                </View>
              )}
              
              {/* Dragging ghost - Only show when threshold is met */}
              {isDraggingEvent && draggedEvent && isDragThresholdMet && (
                <View
                  style={[
                    styles.event,
                    styles.dragGhost,
                    {
                      position: 'absolute',
                      top: temporaryEventPosition.top,
                      height: draggedEvent.height,
                      left: `${temporaryEventPosition.left}%`,
                      width: `${draggedEvent.width}%`,
                      backgroundColor: 'rgba(100, 180, 100, 0.3)', 
                      borderColor: 'rgba(100, 180, 100, 0.8)',
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      borderLeftWidth: 4,
                      borderLeftColor: getEventColor(draggedEvent.colorId),
                      zIndex: 10,
                      pointerEvents: 'none' as any,
                    }
                  ]}
                >
                  <ThemedText style={styles.ghostText}>
                    {draggedEvent.summary || 'Untitled Event'} • {(() => {
                      // Calculate the new day of week
                      const newDayIndex = Math.floor(temporaryEventPosition.left / (100/7));
                      const newDayName = currentWeek[newDayIndex]?.toLocaleDateString('en-US', { weekday: 'short' }) || '';
                      
                      // Calculate new time based on vertical position
                      const hourHeight = 60;
                      const startHour = Math.floor(temporaryEventPosition.top / hourHeight);
                      const startMinute = Math.round((temporaryEventPosition.top % hourHeight) / (hourHeight/60) / 15) * 15;
                      
                      const endHour = Math.floor((temporaryEventPosition.top + draggedEvent.height) / hourHeight);
                      const endMinute = Math.round(((temporaryEventPosition.top + draggedEvent.height) % hourHeight) / (hourHeight/60) / 15) * 15;
                      
                      const startTime = `${startHour % 12 || 12}:${startMinute.toString().padStart(2, '0')}${startHour >= 12 ? 'p' : 'a'}`;
                      const endTime = `${endHour % 12 || 12}:${endMinute.toString().padStart(2, '0')}${endHour >= 12 ? 'p' : 'a'}`;
                      
                      return `${newDayName} ${startTime}-${endTime}`;
                    })()}
                  </ThemedText>
                </View>
              )}
              
              {/* Events */}
              {positionedEvents.map((event) => {
                // Calculate width percentage based on the day column
                const leftPercentage = event.column * (100 / 7);
                const widthPercentage = (event.columnSpan * (100 / 7)) - 1;
                
                const isSelected = editingEvent?.id === event.id;
                const isBeingResized = isEventResizing && editingEvent?.id === event.id;
                const isBeingDragged = isDraggingEvent && draggedEvent?.id === event.id;
                const isDraggingPastThreshold = isBeingDragged && isDragThresholdMet;
                
                // Determine display position and size
                const displayTop = isBeingDragged ? temporaryEventPosition.top : event.top;
                const displayLeft = isBeingDragged ? temporaryEventPosition.left : leftPercentage;
                const displayHeight = isBeingResized ? temporaryEventHeight : event.height;
                
                return (
                  <View
                    id={`event-${event.id}`}
                    key={event.id}
                    className="calendar-event"
                    style={[
                      styles.event,
                      isSelected && styles.selectedEvent,
                      {
                        top: displayTop,
                        height: displayHeight,
                        left: `${displayLeft}%`,
                        width: `${widthPercentage}%`,
                        backgroundColor: getEventBgColor(event.colorId),
                        borderLeftColor: getEventColor(event.colorId),
                        borderLeftWidth: 4,
                        zIndex: isSelected || isBeingDragged ? 5 : 2,
                        cursor: isDraggingPastThreshold ? 'grabbing' as any : 'grab' as any,
                        opacity: isDraggingPastThreshold ? 0.8 : 1,
                      }
                    ]}
                  >
                    <TouchableOpacity 
                      style={styles.eventContent}
                      onPress={() => {
                        // Only select the event if we're not dragging or resizing
                        if (!isDraggingEvent && !isEventResizing) {
                          setEditingEvent(event);
                          setEditEventText(event.summary || '');
                          setShowDeleteConfirm(false);
                        }
                      }}
                      // Use a direct DOM event handler that won't interfere with React Native's gesture system
                      {...(Platform.OS === 'web' ? {
                        // @ts-ignore - Web-only prop
                        onMouseDown: (e: any) => {
                          // Prevent this from interfering with resize
                          if (e.target.closest('.resize-handle')) {
                            return;
                          }
                          
                          // Start drag operation
                          e.preventDefault(); // Prevent text selection
                          e.stopPropagation(); // Stop event bubbling
                          startDragEvent(event, e.clientX, e.clientY);
                        }
                      } : {
                        // Mobile fallback
                        onLongPress: () => startDragEvent(event, 0, 0)
                      })}
                    >
                      <ThemedText 
                        style={[
                          styles.eventTitle, 
                          isSelected && styles.selectedEventTitle
                        ]} 
                        numberOfLines={1}
                      >
                        {event.summary}
                      </ThemedText>
                      <ThemedText style={styles.eventTime} numberOfLines={1}>
                        {formatEventTime(event.start.dateTime)} - {formatEventTime(event.end.dateTime)}
                      </ThemedText>
                    </TouchableOpacity>
                    
                    {/* Update the resize handle to have a specific className for targeting */}
                    <View 
                      className="resize-handle"
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 8,
                        backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        cursor: 'ns-resize' as any
                      }}
                      {...(Platform.OS === 'web' ? {
                        // @ts-ignore - Web-only prop
                        onMouseDown: (e: any) => {
                          e.stopPropagation();
                          e.preventDefault();
                          startResizeEvent(event, e.clientY);
                        }
                      } : {
                        onTouchStart: (e: any) => {
                          startResizeEvent(event, e.nativeEvent.pageY);
                        }
                      })}
                    />
                  </View>
                );
              })}
              
              {/* Add the ghost element for drag preview */}
              {renderDragGhost()}
            </View>
          </View>
        </ScrollView>
      </View>
      
      {/* Show drag message when a todo is being dragged */}
      {draggedTodo && (
        <View style={styles.dragIndicator}>
          <ThemedText style={styles.dragIndicatorText}>
            Drag to place "{draggedTodo.text}" on calendar
          </ThemedText>
        </View>
      )}
      
      {/* For initial loading, you can show a loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ThemedText style={styles.loadingText}>Loading events...</ThemedText>
        </View>
      )}
      
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {/* Event Editing Panel */}
      <ThemedView 
        style={styles.eventEditingPanel}
        className="event-editing-panel"
      >
        <View ref={editingPanelRef} />
        {editingEvent ? (
          <View style={styles.editingPanelContent}>            
            <View style={styles.editingPanelBody}>
              <View style={styles.editField}>
                <ThemedText style={styles.editFieldLabel}>Title</ThemedText>
                <TextInput
                  value={editEventText}
                  onChangeText={setEditEventText}
                  style={styles.editTitleInput}
                  placeholder="Event title"
                  {...(Platform.OS === 'web' ? {
                    // @ts-ignore - Web-only prop
                    onKeyPress: (e: any) => {
                      if (e.key === 'Enter' || e.keyCode === 13) {
                        // Prevent form submission if in a form
                        e.preventDefault();
                        
                        // Only save if the text has changed
                        if (editEventText.trim() !== editingEvent.summary) {
                          updateEvent(editingEvent.id, { summary: editEventText })
                            .then(() => {
                              // Update local state
                              setEvents(prevEvents => 
                                prevEvents.map(evt => 
                                  evt.id === editingEvent.id 
                                    ? { ...evt, summary: editEventText }
                                    : evt
                                )
                              );
                              
                              // Optionally close the panel after save
                              // setEditingEvent(null);
                            });
                        }
                      }
                    }
                  } : {})}
                />
              </View>
              
              <View style={styles.editField}>
                <ThemedText style={styles.editFieldLabel}>Time</ThemedText>
                <ThemedText style={styles.editFieldValue}>
                  {editingEvent.start?.dateTime && formatEventTime(editingEvent.start.dateTime)} - 
                  {editingEvent.end?.dateTime && formatEventTime(editingEvent.end.dateTime)}
                </ThemedText>
              </View>
              
              <View style={styles.editActions}>
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={() => {
                    if (editEventText.trim() !== editingEvent.summary) {
                      updateEvent(editingEvent.id, { summary: editEventText })
                        .then(() => {
                          // Update local state
                          setEvents(prevEvents => 
                            prevEvents.map(evt => 
                              evt.id === editingEvent.id 
                                ? { ...evt, summary: editEventText }
                                : evt
                            )
                          );
                        });
                    }
                    // Don't close panel here - let user click away to close it
                  }}
                >
                  <ThemedText style={styles.saveButtonText}>Save</ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.editingDeleteButton}
                  onPress={() => setShowDeleteConfirm(true)}
                >
                  <ThemedText style={styles.editingDeleteButtonText}>Delete</ThemedText>
                </TouchableOpacity>
              </View>
              
              {showDeleteConfirm && (
                <View style={styles.editingDeleteConfirmContainer}>
                  <ThemedText style={styles.editingDeleteConfirmText}>
                    Are you sure you want to delete this event?
                  </ThemedText>
                  <View style={styles.editingDeleteConfirmButtons}>
                    <TouchableOpacity 
                      style={styles.confirmDeleteButton}
                      onPress={() => {
                        deleteEvent(editingEvent.id);
                        // Deletion will close the panel when complete
                      }}
                    >
                      <ThemedText style={styles.confirmDeleteText}>Delete</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.cancelDeleteButton}
                      onPress={() => setShowDeleteConfirm(false)}
                    >
                      <ThemedText style={styles.cancelDeleteText}>Cancel</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        ) : (
          <ThemedText style={styles.noEventSelectedText}>
            Select an event to edit its details
          </ThemedText>
        )}
      </ThemedView>

      {/* On the main calendar container, add this overlay when editing */}
      {editingEvent && Platform.OS === 'web' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 250, // Match the height of the editing panel
            zIndex: 4, // Above events but below the editing panel
            backgroundColor: 'transparent', // Transparent overlay
          }}
          onClick={() => {
            setEditingEvent(null);
            if (showDeleteConfirm) {
              setShowDeleteConfirm(false);
            }
          }}
        />
      )}
      {message && (
        <View style={styles.messageContainer}>
          <ThemedText style={styles.messageText}>{message}</ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: 'white',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthYearTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#202020',
  },
  navButton: {
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 4,
  },
  navButtonText: {
    fontSize: 16,
    color: '#202020',
  },
  todayButton: {
    padding: 8,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  todayButtonText: {
    fontSize: 14,
    color: '#202020',
  },
  refreshButton: {
    padding: 8,
    marginLeft: 8,
  },
  timeZoneRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingLeft: 60, // Width of time column
  },
  timeZoneText: {
    fontSize: 12,
    color: '#666',
    marginRight: 20,
  },
  calendarWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  allDayRow: {
    flexDirection: 'row',
    height: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  allDayLabel: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  allDayText: {
    fontSize: 12,
    color: '#666',
  },
  allDayEventsContainer: {
    flex: 1,
    position: 'relative',
  },
  allDayEvent: {
    position: 'absolute',
    height: 24,
    borderRadius: 3,
    top: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  allDayEventText: {
    fontSize: 12,
    color: '#1B5E20',
  },
  scrollContainer: {
    flex: 1,
  },
  dayHeaders: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: 'white',
    zIndex: 1,
  },
  timeColumnHeader: {
    width: 60,
  },
  dayHeader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    position: 'relative',
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  firstDayHeader: {
    borderLeftWidth: 1,
    borderLeftColor: '#f0f0f0',
  },
  dayName: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
  dayNumberContainer: {
    position: 'relative',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    color: '#333',
    zIndex: 1,
  },
  todayCircle: {
    position: 'absolute',
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF5350', // Red circle for today
  },
  todayNumberText: {
    color: 'white',
    zIndex: 2,
  },
  timeGrid: {
    flexDirection: 'row',
    height: TIME_SLOTS_COUNT * 60,
  },
  timeLabels: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  timeLabel: {
    height: 60,
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingRight: 8,
  },
  timeLabelText: {
    fontSize: 12,
    textAlign: 'right',
    color: '#666',
  },
  gridContent: {
    flex: 1,
    position: 'relative',
  },
  hourLine: {
    position: 'relative',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  event: {
    position: 'absolute',
    borderRadius: 4,
    padding: 0,
    paddingLeft: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  eventTitle: {
    fontSize: 11, // Reduce font size from 12 to 11
    lineHeight: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 0, // Add a smaller margin between title and time
    overflow: 'visible',
  },
  eventTime: {
    fontSize: 9, // Reduce font size from 10 to 9
    lineHeight: 12,
    color: '#666',
    marginTop: 0, // Remove margin top
  },
  signInButton: {
    backgroundColor: '#4285F4',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 20,
    marginHorizontal: 16,
  },
  signInText: {
    color: 'white',
    fontWeight: '500',
  },
  errorText: {
    color: '#D32F2F',
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  currentTimeIndicator: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#EF5350', // Red line like in Google Calendar
    zIndex: 3, // Make sure it appears above events
  },
  
  currentTimeDot: {
    position: 'absolute',
    left: -4, // Slightly to the left of the line
    top: -4, // Center vertically
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF5350', // Same red color
  },
  eventTitleContainer: {
    flex: 1,
  },
  eventTitleInput: {
    fontSize: 11,
    fontWeight: '500',
    color: '#333',
    borderWidth: 0,
    padding: 0,
    height: 20,
    width: '100%',
  },
  eventActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  eventAction: {
    padding: 2,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginHorizontal: 2,
  },
  eventActionText: {
    fontSize: 9,
    color: '#333',
  },
  deleteConfirm: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 8,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  deleteConfirmText: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textAlign: 'center',
  },
  deleteConfirmButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  deleteButton: {
    backgroundColor: '#EF5350',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 12,
  },
  cancelButton: {
    backgroundColor: '#9e9e9e',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 12,
  },
  resizeHandle: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'transparent',
    cursor: 'ns-resize',
  },
  eventGhost: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 100,
    padding: 4,
  },
  ghostText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  ghostTime: {
    fontSize: 10,
  },
  updateIndicator: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 83, 80, 0.2)',
    marginLeft: 8,
  },
  updateIndicatorText: {
    fontSize: 12,
    color: '#EF5350',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    fontSize: 16,
    color: '#333',
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  ghostEvent: {
    backgroundColor: 'rgba(100, 150, 255, 0.3)',
    borderWidth: 2,
    borderStyle: 'dashed' as any,
    borderColor: 'rgba(100, 150, 255, 0.8)',
    pointerEvents: 'none' as any,
  },
  snapLine: {
    position: 'absolute',
    left: 50,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    zIndex: 1,
  },
  eventEditingPanel: {
    height: 250, // Fixed height for the editing panel
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    backgroundColor: 'rgba(250, 250, 250, 0.97)',
    padding: 15,
    width: '100%',
  },
  editingPanelContent: {
    flex: 1,
  },
  editingPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  editingPanelTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: -2,
  },
  editingPanelBody: {
    flex: 1,
  },
  editField: {
    marginBottom: 10,
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 3,
    color: '#555',
  },
  editTitleInput: {
    height: 36,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    paddingHorizontal: 10,
    backgroundColor: 'white',
  },
  editFieldValue: {
    fontSize: 14,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 4,
    marginRight: 10,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  editingDeleteButton: {
    backgroundColor: '#EF5350',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 4,
  },
  editingDeleteButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  editingDeleteConfirmContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(255, 235, 235, 0.9)',
    borderRadius: 4,
  },
  editingDeleteConfirmText: {
    marginBottom: 8,
    textAlign: 'center',
  },
  editingDeleteConfirmButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  confirmDeleteButton: {
    backgroundColor: '#EF5350',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginRight: 10,
  },
  confirmDeleteText: {
    color: 'white',
    fontWeight: '500',
  },
  cancelDeleteButton: {
    backgroundColor: '#9e9e9e',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  cancelDeleteText: {
    color: 'white',
    fontWeight: '500',
  },
  noEventSelectedText: {
    textAlign: 'center',
    color: '#888',
    fontStyle: 'italic',
  },
  selectedEvent: {
    boxShadow: '0 0 0 2px rgba(66, 133, 244, 0.8)',
    zIndex: 3,
  },
  selectedEventTitle: {
    fontWeight: '500',
  },
  eventContent: {
    flex: 1,
    paddingLeft: 3,
  },
  dragGhost: {
    backgroundColor: 'rgba(100, 180, 100, 0.3)',
    borderWidth: 2,
    borderStyle: 'dashed' as any,
    borderColor: 'rgba(100, 180, 100, 0.8)',
    pointerEvents: 'none' as any,
  },
  dragIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 4,
    zIndex: 100,
  },
  dragIndicatorText: {
    color: '#fff',
    fontSize: 12,
  },
  calendarGrid: {
    flex: 1,
    position: 'relative',
  },
  messageContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  messageText: {
    backgroundColor: '#4CAF50', // Green for success
    color: 'white',
    padding: 10,
    borderRadius: 5,
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 