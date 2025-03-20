import React, { useState, useEffect } from 'react';
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

export default function GoogleCalendar({ onTodoDrop }: { onTodoDrop?: (todoItem: any, date: Date) => void }) {
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
  const [resizeStartY, setResizeStartY] = useState(0);
  const [originalEventHeight, setOriginalEventHeight] = useState(0);
  const [temporaryEventHeight, setTemporaryEventHeight] = useState(0);
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
  const gridRef = React.useRef<View>(null);
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);
  const [todoDropTarget, setTodoDropTarget] = useState<{
    dayIndex: number;
    timePosition: number;
  } | null>(null);

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

  // Fetch calendar events
  const fetchEvents = async (accessToken: string, silentRefresh = false) => {
    try {
      if (!silentRefresh) {
        setLoading(true); // Only show loading indicator if not a silent refresh
      }
      
      // Use the start and end of current week for the date range
      const startDate = new Date(currentWeek[0]);
      const endDate = new Date(currentWeek[6]);
      endDate.setHours(23, 59, 59);
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startDate.toISOString()}&timeMax=${endDate.toISOString()}&singleEvents=true&orderBy=startTime`,
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

  // Format the month and year like in Notion
  const formatMonthYear = () => {
    const currentMonth = currentWeek[0].toLocaleString('en-US', { month: 'long' });
    const currentYear = currentWeek[0].getFullYear();
    return `${currentMonth} ${currentYear}`;
  };

  // Format date for display
  const formatEventTime = (dateTimeString: string) => {
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
        return new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime();
      });
      
      // Position each event
      dayEvents.forEach(event => {
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

  // Handle navigation between weeks
  const navigateWeek = (direction: number, silentRefresh = false) => {
    const newStartDate = new Date(currentWeek[0]);
    newStartDate.setDate(newStartDate.getDate() + (7 * direction));
    const newWeek = getDaysOfWeek(newStartDate);
    setCurrentWeek(newWeek);
    
    // If we have a token, fetch events for the new week
    if (token) {
      fetchEvents(token, silentRefresh);
    }
  };

  // Add function to create an event from a todo item
  const createEventFromTodo = async (todoText: string, dropDate: Date) => {
    if (!token) return;
    
    try {
      setIsUpdatingEvent(true);
      
      // Create end time (30 mins after drop time)
      const endTime = new Date(dropDate.getTime() + 30 * 60 * 1000);
      
      // Format the event object
      const newEvent = {
        summary: todoText,
        start: {
          dateTime: dropDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      };
      
      // Send the request to create a new event
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newEvent),
        }
      );
      
      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Failed to create event (${response.status}): ${responseText}`);
      }
      
      // Silently refresh events
      fetchEvents(token, true);
      
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Failed to create event: ${errorMessage}`);
      console.error('Create event error:', e);
    } finally {
      setIsUpdatingEvent(false);
      setTodoDropTarget(null);
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
      const days = getDaysOfWeek(startDate);
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
  const updateEvent = async (eventId: string, updates: Partial<CalendarEvent>) => {
    if (!token) return;
    
    try {
      setIsUpdatingEvent(true);
      
      // First get the current event to merge with updates
      const eventResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (!eventResponse.ok) {
        console.error('Failed to fetch event:', await eventResponse.text());
        throw new Error(`Failed to fetch event: ${eventResponse.statusText}`);
      }
      
      const currentEvent = await eventResponse.json();
      
      // Merge updates with current event
      const updatedEvent = { ...currentEvent, ...updates };
      
      // Send the update to Google Calendar API
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updatedEvent),
        }
      );
      
      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Failed to update event (${response.status}): ${responseText}`);
      }
      
      // Silently refresh events without showing loading overlay
      fetchEvents(token, true);
      
      // Clear editing state
      setEditingEvent(null);
      setEditEventText('');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Failed to update event: ${errorMessage}`);
      console.error('Update error:', e);
    } finally {
      setIsUpdatingEvent(false);
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
      
      // Clear state
      setShowDeleteConfirm(false);
      setEditingEvent(null);
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
  };

  // Add function to handle resize move
  const handleResizeMove = (clientY: number) => {
    if (!isEventResizing || !editingEvent) return;
    
    const deltaY = clientY - resizeStartY;
    const newHeight = Math.max(30, originalEventHeight + deltaY);
    setTemporaryEventHeight(newHeight);
  };

  // Add function to finish resizing an event
  const finishResizeEvent = () => {
    if (!isEventResizing || !editingEvent) return;
    
    // Calculate new end time based on height change
    const hourHeight = 60; // Height for one hour in pixels
    const additionalHours = (temporaryEventHeight - originalEventHeight) / hourHeight;
    
    if (Math.abs(additionalHours) > 0.05) { // Only update if changed by at least 3 minutes
      // Get current end time
      const currentEndTime = new Date(editingEvent.end.dateTime);
      
      // Add the additional time
      const newEndTime = new Date(currentEndTime.getTime() + (additionalHours * 60 * 60 * 1000));
      
      // Update the event
      updateEvent(editingEvent.id, {
        end: {
          dateTime: newEndTime.toISOString(),
          timeZone: editingEvent.end.timeZone
        }
      });
    }
    
    // Reset state
    setIsEventResizing(false);
    setEditingEvent(null);
    setTemporaryEventHeight(0);
    setOriginalEventHeight(0);
    setResizeStartY(0);
  };

  // Update the startDragEvent function with logging
  const startDragEvent = (event: PositionedEvent, clientX: number, clientY: number) => {
    console.log('startDragEvent', {
      id: event.id,
      summary: event.summary,
      position: { top: event.top, left: event.left }
    });
    
    setIsDraggingEvent(true);
    setDraggedEvent(event);
    setDragStartY(clientY);
    setDragStartX(clientX);
    
    // Calculate the offset within the event where the drag started
    const eventRect = document.getElementById(`event-${event.id}`)?.getBoundingClientRect();
    if (eventRect) {
      setDragOffsetY(clientY - eventRect.top);
    }
    
    setTemporaryEventPosition({
      top: event.top,
      left: event.left
    });
    
    // Initialize the snapped position with the current event's position and dimensions
    setSnappedPosition({
      top: event.top,
      left: event.left,
      width: event.width,
      height: event.height
    });
    
    console.log('Ghost initial position set to:', {
      top: event.top,
      left: event.left,
      width: event.width,
      height: event.height
    });
  };

  // Modify the handleDragMove function to use the ref
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingEvent || !draggedEvent) {
      console.log('Drag move ignored - not in dragging state');
      return;
    }
    
    // Get grid element using the ref instead of querySelector
    const gridElement = gridRef.current;
    if (!gridElement) {
      console.error('Grid element ref not found!');
      return;
    }
    
    // Get the grid's measurements using the native method
    // @ts-ignore - measure exists on the native element
    gridElement.measure((x, y, width, height, pageX, pageY) => {
      // Calculate the new position relative to the grid
      const newTop = Math.max(0, clientY - pageY - dragOffsetY);
      
      // Calculate the column based on the x position
      const columnWidth = width / 7;
      const column = Math.min(6, Math.max(0, Math.floor((clientX - pageX) / columnWidth)));
      const newLeft = column * (100 / 7);
      
      // Set the actual drag position (for visual feedback during drag)
      setTemporaryEventPosition({
        top: newTop,
        left: newLeft
      });
      
      // Calculate the snapped position
      const hourHeight = 60; // Height for one hour in pixels
      const snapInterval = 15; // Snap to 15-minute intervals
      const snapIntervalHeight = (snapInterval / 60) * hourHeight; // 15px
      
      // Calculate snapped top position
      const snapMultiplier = Math.round(newTop / snapIntervalHeight);
      const snappedTop = snapMultiplier * snapIntervalHeight;
      
      // Update the snapped position state
      const newSnappedPosition = {
        top: snappedTop,
        left: newLeft,
        width: draggedEvent.width,
        height: draggedEvent.height
      };
      
      setSnappedPosition(newSnappedPosition);
      
    //   console.log('Drag move position:', { 
    //     temporaryPos: { top: newTop, left: newLeft },
    //     snappedPos: newSnappedPosition
    //   });
    });
  };

  // Modified function to finish dragging with snapping
  const finishDragEvent = () => {
    if (!isDraggingEvent || !draggedEvent) return;
    
    // Use the snapped position instead of the temporary position
    const hourHeight = 60; // Height for one hour in pixels
    
    // Calculate the new start hour based on the snapped position
    const newStartHour = snappedPosition.top / hourHeight;
    const newStartHourWhole = Math.floor(newStartHour);
    const newStartMinutes = Math.round((newStartHour - newStartHourWhole) * 60);
    
    // Calculate which day of the week the event was dropped on
    const newColumn = Math.round(snappedPosition.left / (100 / 7));
    const newDate = new Date(currentWeek[newColumn]);
    
    // Set hours and minutes for the new start time
    newDate.setHours(newStartHourWhole, newStartMinutes, 0, 0);
    
    // Calculate event duration in milliseconds
    const originalStartTime = new Date(draggedEvent.start.dateTime);
    const originalEndTime = new Date(draggedEvent.end.dateTime);
    const duration = originalEndTime.getTime() - originalStartTime.getTime();
    
    // Calculate new end time by adding the same duration
    const newEndTime = new Date(newDate.getTime() + duration);
    
    // Update the event with new start and end times
    updateEvent(draggedEvent.id, {
      start: {
        dateTime: newDate.toISOString(),
        timeZone: draggedEvent.start.timeZone
      },
      end: {
        dateTime: newEndTime.toISOString(),
        timeZone: draggedEvent.end.timeZone
      }
    });
    
    // Reset state
    setIsDraggingEvent(false);
    setDraggedEvent(null);
    setTemporaryEventPosition({ top: 0, left: 0 });
    setSnappedPosition({ top: 0, left: 0, width: 0, height: 0 });
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
      
      // Add event listeners
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Clean up
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingEvent, isEventResizing, draggedEvent, dragStartY, dragStartX, dragOffsetY, temporaryEventPosition]);

  // Only show on desktop platforms
  if (Platform.OS !== 'web') {
    return null;
  }

  const positionedEvents = getPositionedEvents();
  const timeSlots = getTimeSlots();

  // Custom style with dynamic height
  const timeGridStyle = {
    ...styles.timeGrid,
    height: timeSlots.length * 60
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

  return (
    <ThemedView style={styles.container}>
      {/* Header with Month/Year and Navigation */}
      <View style={styles.header}>
        <ThemedText style={styles.monthYearTitle}>{formatMonthYear()}</ThemedText>
        <View style={styles.headerControls}>
          <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.navButton}>
            <ThemedText style={styles.navButtonText}>←</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrentWeek(getDaysOfWeek())} style={styles.todayButton}>
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
      <View style={styles.calendarWrapper}>
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
            {Object.entries(getAllDayEventsByDay()).map(([dayIndex, events]) => 
              events.map((event, eventIndex) => (
                <View 
                  key={`allday-${event.id}-${eventIndex}`} 
                  style={[
                    styles.allDayEvent, 
                    { 
                      backgroundColor: getEventColor(event.colorId, true),
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
              style={styles.gridContent}
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
              
              {/* Ghost element */}
              {isDraggingEvent && draggedEvent && (
                <View
                  id="event-ghost"
                  style={[
                    styles.eventGhost,
                    {
                      top: snappedPosition.top,
                      height: snappedPosition.height,
                      left: `${snappedPosition.left}%`,
                      width: `${(draggedEvent.columnSpan * (100 / 7)) - 1}%`,
                      borderLeftColor: getEventColor(draggedEvent.colorId),
                      borderLeftWidth: 4,
                      opacity: 1 // Use opacity: 1 to ensure visibility
                    }
                  ]}
                />
              )}
              
              {/* Events */}
              {positionedEvents.map((event) => {
                // Calculate width percentage based on the day column
                const leftPercentage = event.column * (100 / 7);
                const widthPercentage = (event.columnSpan * (100 / 7)) - 1;
                
                const isBeingEdited = editingEvent?.id === event.id;
                const isBeingResized = isEventResizing && editingEvent?.id === event.id;
                const isBeingDragged = isDraggingEvent && draggedEvent?.id === event.id;
                
                // Determine display position and size
                const displayTop = isBeingDragged ? temporaryEventPosition.top : event.top;
                const displayLeft = isBeingDragged ? temporaryEventPosition.left : leftPercentage;
                const displayHeight = isBeingResized ? temporaryEventHeight : event.height;
                
                return (
                  <View
                    id={`event-${event.id}`}
                    key={event.id}
                    style={[
                      styles.event,
                      {
                        top: displayTop,
                        height: displayHeight,
                        left: `${displayLeft}%`,
                        width: `${widthPercentage}%`,
                        backgroundColor: getEventBgColor(event.colorId),
                        borderLeftColor: getEventColor(event.colorId),
                        borderLeftWidth: 4,
                        zIndex: isBeingEdited || isBeingDragged ? 5 : 2,
                        cursor: isBeingDragged ? 'grabbing' : 'grab', // Show grabbing cursor while dragging
                        opacity: isBeingDragged ? 0.8 : 1, // Make it slightly transparent while dragging
                      }
                    ]}
                  >
                    {isBeingEdited && editingEvent === event ? (
                      <>
                        <TextInput
                          value={editEventText}
                          onChangeText={setEditEventText}
                          style={styles.eventTitleInput}
                          autoFocus
                          onBlur={() => {
                            if (editEventText.trim() !== event.summary) {
                              updateEvent(event.id, { summary: editEventText });
                            } else {
                              setEditingEvent(null);
                            }
                          }}
                          onSubmitEditing={() => {
                            updateEvent(event.id, { summary: editEventText });
                          }}
                        />
                        <View style={styles.eventActions}>
                          <TouchableOpacity 
                            style={styles.eventAction}
                            onPress={() => setShowDeleteConfirm(true)}
                          >
                            <ThemedText style={styles.eventActionText}>Delete</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.eventAction}
                            onPress={() => {
                              setEditingEvent(null);
                              setEditEventText('');
                            }}
                          >
                            <ThemedText style={styles.eventActionText}>Cancel</ThemedText>
                          </TouchableOpacity>
                        </View>
                        {showDeleteConfirm && (
                          <View style={styles.deleteConfirm}>
                            <ThemedText style={styles.deleteConfirmText}>
                              Delete this event?
                            </ThemedText>
                            <View style={styles.deleteConfirmButtons}>
                              <TouchableOpacity 
                                style={styles.deleteButton}
                                onPress={() => deleteEvent(event.id)}
                              >
                                <ThemedText style={styles.deleteButtonText}>Yes</ThemedText>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={styles.cancelButton}
                                onPress={() => setShowDeleteConfirm(false)}
                              >
                                <ThemedText style={styles.cancelButtonText}>No</ThemedText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </>
                    ) : (
                      <>
                        <TouchableOpacity 
                          onPress={() => {
                            setEditingEvent(event);
                            setEditEventText(event.summary);
                            setShowDeleteConfirm(false);
                          }}
                          onMouseDown={(e) => {
                            // Only start dragging if not in edit mode
                            if (!isBeingEdited && !isBeingResized) {
                              e.preventDefault(); // Prevent text selection during drag
                              startDragEvent(event, e.nativeEvent.clientX, e.nativeEvent.clientY);
                            }
                          }}
                          style={[
                            styles.eventTitleContainer,
                            { cursor: 'grab' } // Change cursor to indicate draggable
                          ]}
                        >
                          <ThemedText style={styles.eventTitle} numberOfLines={1}>
                            {event.summary}
                          </ThemedText>
                        </TouchableOpacity>
                        <ThemedText style={styles.eventTime} numberOfLines={1}>
                          {formatEventTime(event.start.dateTime)} - {formatEventTime(event.end.dateTime)}
                        </ThemedText>
                        {/* Resize handle, unchanged */}
                        <View 
                          style={styles.resizeHandle}
                          onTouchStart={(e) => startResizeEvent(event, e.nativeEvent.pageY)}
                          onMouseDown={(e) => {
                            e.stopPropagation(); // Prevent triggering drag when resizing
                            startResizeEvent(event, e.nativeEvent.clientY);
                          }}
                        />
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
      
      {/* For initial loading, you can show a loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ThemedText style={styles.loadingText}>Loading events...</ThemedText>
        </View>
      )}
      
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
    </ThemedView>
  );
}

// Add function to get background color for events
const getEventBgColor = (colorId: string | undefined) => {
  // Use the same color as the border but with very low opacity
  const baseColor = getEventColor(colorId);
  
  // Extract the hex color and convert to RGB with alpha
  const hex = baseColor.substring(1);
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Return the color with 10% opacity for a subtle background
  //   return `rgba(${r}, ${g}, ${b}, 0.2)`;
  return `rgb(240, 232, 252)`;
};

// Updated color function to support all-day events with different opacity
const getEventColor = (colorId: string | undefined, isAllDay: boolean = false) => {
  const colors: Record<string, string> = {
    '1': '#7986CB', // Lavender
    '2': '#33B679', // Sage
    '3': '#9C27B0', // Purple
    '4': '#E57373', // Reddish
    '5': '#FFB74D', // Orange
    '6': '#FF7043', // Deep Orange
    '7': '#4FC3F7', // Light Blue
    '8': '#78909C', // Blue Grey
    '9': '#7E57C2', // Deeper Purple
    '10': '#26A69A', // Teal
    '11': '#EF5350', // Red
  };
  
  const baseColor = colorId && colors[colorId] ? colors[colorId] : '#8365C0'; // Default purple
  
  // For all-day events, make the background more transparent
  if (isAllDay) {
    // Extract the hex color and convert to RGB with alpha
    const hex = baseColor.substring(1);
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, 0.2)`;
  }
  
  return baseColor;
};

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
    padding: 3,
    paddingLeft: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  eventTitle: {
    fontSize: 11, // Reduce font size from 12 to 11
    fontWeight: '500',
    color: '#333',
    marginBottom: 0, // Add a smaller margin between title and time
    overflow: 'visible',
  },
  eventTime: {
    fontSize: 9, // Reduce font size from 10 to 9
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
    borderRadius: 4,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#EF5350', // Brighter red for better visibility
    borderLeftWidth: 4,
    backgroundColor: 'rgba(239, 83, 80, 0.1)', // Light red background
    zIndex: 4, // Higher z-index to appear above other elements
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
  ghostText: {
    fontSize: 10,
    color: '#4285F4',
    padding: 3,
    paddingLeft: 6,
  },
}); 