import { StyleSheet, TextInput, TouchableOpacity, FlatList, Animated, Platform, RefreshControl, KeyboardAvoidingView, Keyboard, View, TouchableWithoutFeedback } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppState } from 'react-native';
import { Audio } from 'expo-av';
import { Session } from '@supabase/supabase-js';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { Auth } from '@/components/Auth';
import GoogleCalendar from '../../components/GoogleCalendar';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  created_at: string;
  archived: boolean;
  snooze_time: string | null;
  is_on_calendar?: boolean;
}

interface DatePickerPosition {
  x: number;
  y: number;
}

interface TagOption {
  id: string;
  label: string;
  icon: string;
  action: (todo?: TodoItem) => void;
  isSelected: () => boolean;
}

const CalendarIcon = ({ date }: { date?: Date | null }) => {
  const isToday = date && new Date(date).toDateString() === new Date().toDateString();
  const isOverdue = date && new Date(date) < new Date();
  let color = '#007AFF'; // default blue
  
  if (isToday) {
    color = '#9333EA'; // purple for today
  } else if (isOverdue) {
    color = '#FF3B30'; // red for overdue
  }

  return (
    <ThemedView style={[styles.calendarIconContainer, { borderColor: color }]}>
      <ThemedView style={[styles.calendarHeader, { backgroundColor: color }]} />
      <ThemedText style={[styles.calendarDay, { color }]}>
        {date ? date.getDate() : ''}
      </ThemedText>
    </ThemedView>
  );
};

export default function HomeScreen() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState<DatePickerPosition | null>(null);
  const inputRef = useRef<TextInput>(null);
  const tabBarHeight = useBottomTabBarHeight();
  const [autoSetDueDate, setAutoSetDueDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const [itemHeight, setItemHeight] = useState<number>(44); // Default fallback height
  const keyboardDismissOffset = 0; // Threshold for keyboard dismissal
  const [lastScrollY, setLastScrollY] = useState(0);
  const [lastScrollTime, setLastScrollTime] = useState(Date.now());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [tagMode, setTagMode] = useState(false);

  const [hideArchived, setHideArchived] = useState(true);
  const [hideSnoozed, setHideSnoozed] = useState(true);
  
  // const [selectedTodoForTag, setSelectedTodoForTag] = useState<TodoItem | null>(null);
  const [autoArchive, setAutoArchive] = useState(false);
  const [autoSnoozeDate, setAutoSnoozeDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [autoSnooze, setAutoSnooze] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [draggedTodo, setDraggedTodo] = useState<TodoItem | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);

  const [pressedColorBarId, setPressedColorBarId] = useState<string | null>(null);

  const tagOptions: TagOption[] = [
    {
      id: 'due_today',
      label: 'Due Today',
      icon: <CalendarIcon date={new Date()} />,
      action: (todo) => {
        if (todo) {
          const today = new Date();
          today.setHours(12, 0, 0, 0);
          handleUpdateDueDate(todo.id, today);
        } else {
          setAutoSetDueDate(!autoSetDueDate);
        }
      },
      isSelected: () => autoSetDueDate
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: '📦',
      action: (todo) => {
        if (todo) {
          toggleArchiveTodo(todo.id, todo.archived);
        } else {
          setAutoArchive(!autoArchive);
        }
      },
      isSelected: () => autoArchive
    },
    {
      id: 'snooze',
      label: 'Snooze',
      icon: '💤',
      action: (todo) => {
        if (todo) {
          toggleSnoozeTimeTodo(todo.id, autoSnoozeDate);
        } else {
          setAutoSnooze(!autoSnooze);
        }
      },
      isSelected: () => autoSnooze
    }
  ];

  const TagMenu = () => {
    return (
      <>
        <TouchableOpacity 
          style={[
            styles.tagButton,
            tagMode && styles.tagButtonActive
          ]}
          onPress={() => {
            setShowTagMenu(!showTagMenu);
            setTagMode(!tagMode);
          }}
        >
          <ThemedText style={styles.tagButtonIcon}>
            {(autoSetDueDate || autoArchive || autoSnooze) ? '📌' : '🏷️'}
          </ThemedText>
        </TouchableOpacity>

        {showTagMenu && (
          <>
            <TouchableOpacity 
              style={styles.tagMenuBackdrop}
              onPress={() => {
                setShowTagMenu(false);
              }}
            />
            <ThemedView style={styles.tagMenuContainer}>
              {tagOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.tagOption,
                    option.isSelected() && styles.tagOptionSelected
                  ]}
                  onPress={() => {
                    option.action(); // Call action without todo parameter to toggle state
                    setShowTagMenu(false);
                  }}
                >
                  <ThemedText style={styles.tagOptionIcon}>{option.icon}</ThemedText>
                  <ThemedText style={[
                    styles.tagOptionLabel,
                    option.isSelected() && styles.tagOptionLabelSelected
                  ]}>
                    {option.label}
                  </ThemedText>
                  {option.isSelected() && (
                    <ThemedText style={styles.checkmark}>✓</ThemedText>
                  )}
                </TouchableOpacity>
              ))}
            </ThemedView>
          </>
        )}
      </>
    );
  };

  const SettingsMenu = () => (
    <>
      <TouchableOpacity 
        style={styles.settingsButton}
        onPress={() => setShowSettings(!showSettings)}
      >
        <ThemedText style={styles.settingsIcon}>⚙️</ThemedText>
      </TouchableOpacity>

      {showSettings && (
        <>
          <TouchableOpacity 
            style={styles.settingsBackdrop}
            onPress={() => setShowSettings(false)}
          />
          <ThemedView style={styles.settingsMenuContainer}>
            <TouchableOpacity
              style={styles.settingsOption}
              onPress={() => {
                console.log('Hide Archived button pressed from', hideArchived, 'to', !hideArchived);
                setHideArchived(!hideArchived);
              }}
            >
              <ThemedText style={styles.settingsOptionLabel}>
                Hide Archived
              </ThemedText>
              {hideArchived && <ThemedText style={styles.checkmark}>✓</ThemedText>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsOption}
              onPress={() => {
                setHideSnoozed(!hideSnoozed);
              }}
            >
              <ThemedText style={styles.settingsOptionLabel}>
                Hide Snoozed
              </ThemedText>
              {hideSnoozed && <ThemedText style={styles.checkmark}>✓</ThemedText>}
            </TouchableOpacity>
          </ThemedView>
        </>
      )}
    </>
  );

  useEffect(() => {
    // Initial fetch when component mounts
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession?.user?.id) {
        fetchTodos(initialSession);
      }
      setLoading(false);
    });

    // Set up auth state change listener
    const { data: { authSubscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        fetchTodos(newSession);
      }
    });

    // Set up auto-refresh interval (every 30 seconds)
    const refreshInterval = setInterval(() => {
      if (session?.user?.id) {
        fetchTodos(session);
      }
    }, 30000);

    // Set up app state listener
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && session?.user?.id) {
        fetchTodos(session);
      }
    });

    // Cleanup function
    return () => {
      clearInterval(refreshInterval);
      appStateSubscription.remove();
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, [hideArchived, hideSnoozed]);

  useEffect(() => {
    fetchTodos();
  }, [hideArchived, hideSnoozed]);

  const fetchTodos = async (currentSession = session) => {
    try {
      if (!currentSession?.user?.id) {
        console.log('No user session, skipping fetch');
        return;
      }

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      oneDayAgo.setHours(0, 0, 0, 0);

      let query = supabase
        .from('todos')
        .select('*')
        .or(`completed_at.gt.${oneDayAgo.toISOString()},completed_at.is.null`)
        .eq('user_id', currentSession.user.id);

      // Filter archived unless hideArchived is false
      if (hideArchived) {
        query = query.or('archived.is.false,archived.is.null')
      }

      // Filter snoozed items unless hideSnoozed is false
      if (hideSnoozed) {
        const now = new Date().toISOString();
        query = query.or(`snooze_time.is.null,snooze_time.lt.${now}`);
      }

      const { data, error } = await query
        .order('completed', { ascending: true })
        .order('due_date', { ascending: true, nullsLast: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }

      const standardizedTodos = data?.map(todo => ({
        ...todo,
        due_date: todo.due_date ? standardizeDate(new Date(todo.due_date)) : null,
        created_at: standardizeDate(new Date(todo.created_at)),
        completed_at: todo.completed_at ? standardizeDate(new Date(todo.completed_at)) : null
      })) || [];

      setTodos(standardizedTodos);
    } catch (error) {
      console.error('Error fetching todos:', error);
    }
  };

  // Helper function to standardize date format
  const standardizeDate = (date: Date) => {
    return date.toISOString(); // This will always use .000Z format
  };

  const handleAddTodo = async () => {
    if (inputText.trim().length > 0) {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
      }

      const today = new Date();
      today.setHours(12, 0, 0, 0);

      // Create the todo object with active tag settings
      const newTodo = {
        id: Date.now().toString(),
        text: inputText,
        user_id: session?.user?.id,
        completed: false,
        completed_at: null,
        due_date: autoSetDueDate ? standardizeDate(today) : null,
        created_at: standardizeDate(new Date()),
        archived: autoArchive,
        snooze_time: autoSnooze ? standardizeDate(autoSnoozeDate) : null,
        is_on_calendar: false,
      };
      
      try {
        const { error } = await supabase
          .from('todos')
          .insert([newTodo]);

        if (error) throw error;
        
        setTodos(currentTodos => {
          const updatedTodos = sortTodos([...currentTodos, newTodo]);
          
          setTimeout(() => {
            const indexToScrollTo = Math.max(0, updatedTodos.length - 1);
            flatListRef.current?.scrollToIndex({ 
              index: indexToScrollTo,
              animated: true,
              viewPosition: 1
            });
          }, 100);
          return updatedTodos;
        });
        setInputText('');
        inputRef.current?.focus();
      } catch (error) {
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error
          );
        }
        console.error('Error adding todo:', error);
      }
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setTodos(currentTodos => currentTodos.filter(todo => todo.id !== id));
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };

  // Helper function for sorting todos
  const sortTodos = (todos: TodoItem[]) => {
    return todos.sort((a, b) => {
      // First, sort by completion status (completed at bottom)
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      
      // Then, sort by due date (nulls first, later dates first)
      if (a.due_date !== b.due_date) {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      
      // Finally, sort by creation date (newest first)
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return aTime - bTime;  // Newest first
    });
  };


  const toggleTodoComplete = async (id: string, completed: boolean) => {
    try {
      if (!completed) {
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          );
        }
        // Play sound when marking as completed
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/correct.mp3')
        );
        await sound.playAsync();
      } else {
        if (Platform.OS !== 'web') {
          await Haptics.impactAsync(
            Haptics.ImpactFeedbackStyle.Medium
          );
        }
      }

      const completed_at = !completed ? new Date().toISOString() : null;
      
      const { error } = await supabase
        .from('todos')
        .update({ 
          completed: !completed,
          completed_at 
        })
        .eq('id', id);

      if (error) throw error;
      
      setTodos(currentTodos => {
        const updatedTodos = currentTodos.map(todo => 
          todo.id === id 
            ? { ...todo, completed: !todo.completed, completed_at } 
            : todo
        );
        return sortTodos(updatedTodos);
      });
    } catch (error) {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        );
      }
      console.error('Error updating todo:', error);
    }
  };

  const handleUpdateDueDate = async (id: string, date: Date | null) => {
    try {
      const due_date = date ? standardizeDate(date) : null;
      
      const { error } = await supabase
        .from('todos')
        .update({ due_date })
        .eq('id', id);

      if (error) throw error;
      
      setTodos(currentTodos => 
        sortTodos(currentTodos.map(todo => 
          todo.id === id ? { ...todo, due_date } : todo
        ))
      );
    } catch (error) {
      console.error('Error updating due date:', error);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    
    if (selectedDate && selectedTodoId) {
      selectedDate.setHours(12, 0, 0, 0);
      handleUpdateDueDate(selectedTodoId, selectedDate);
    }
  };

  const toggleArchiveTodo = async (id: string, archived: boolean) => {
    try {
      const { error } = await supabase
        .from('todos')
        .update({ archived: !archived })
        .eq('id', id);

      if (error) throw error;
      
      setTodos(currentTodos => 
        currentTodos.map(todo => 
          todo.id === id ? { ...todo, archived: !archived } : todo
        )
      );

      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Medium
        );
      }
    } catch (error) {
      console.error('Error updating todo:', error);
    }
  };

  const toggleSnoozeTimeTodo = async (id: string, snooze_time: string | null) => {
    console.log('Toggling snooze time for todo:', id, 'to', snooze_time);
    try {
      const { error } = await supabase
        .from('todos')
        .update({ snooze_time: snooze_time })
        .eq('id', id);

      if (error) throw error;

      console.log('Snooze time updated for todo:', id, 'to', snooze_time);
      
      setTodos(currentTodos => 
        currentTodos.map(todo => 
          todo.id === id ? { ...todo, snooze_time: snooze_time } : todo
        )
      );

      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Medium
        );
      }
    } catch (error) {
      console.error('Error updating todo snooze time:', error);
    }
  };


  const renderRightActions = (dragX: Animated.AnimatedInterpolation<number>, todo: TodoItem) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.rightActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.archiveAction]}
          onPress={() => toggleArchiveTodo(todo.id, todo.archived)}
        >
          <Animated.Text 
            style={[
              styles.actionText,
              { transform: [{ scale }] }
            ]}
          >
            {todo.archived ? 'Unarchive' : 'Archive'}
          </Animated.Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteAction]}
          onPress={() => deleteTodo(todo.id)}
        >
          <Animated.Text 
            style={[
              styles.actionText,
              { transform: [{ scale }] }
            ]}
          >
            Delete
          </Animated.Text>
        </TouchableOpacity>
      </View>
    );
  };

  const showDatePickerAtPosition = (event: any, todoId: string) => {
    const { pageX, pageY } = event.nativeEvent;
    setDatePickerPosition({ x: pageX, y: pageY });
    setSelectedTodoId(todoId);
    
    // Set the initial date based on the todo's due date or current date
    const todo = todos.find(t => t.id === todoId);
    const initialDate = todo?.due_date ? new Date(todo.due_date) : new Date(Date.now() - 86400000);
    setSelectedDate(initialDate);
    
    setShowDatePicker(true);
  };

  const handleUpdateTodoText = async (id: string, newText: string) => {
    try {
      const { error } = await supabase
        .from('todos')
        .update({ text: newText })
        .eq('id', id);

      if (error) throw error;
      
      setTodos(currentTodos => 
        currentTodos.map(todo => 
          todo.id === id ? { ...todo, text: newText } : todo
        )
      );
    } catch (error) {
      console.error('Error updating todo text:', error);
    }
  };

  const handleTodoClick = async (todo: TodoItem) => {
    if (!tagMode) return;

    // Call the action function for each selected tag option
    tagOptions.forEach(option => {
      if (option.isSelected()) {
        option.action(todo);
      }
    });

    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light
      );
    }
  };

  const clearDraggedTodo = () => {
    setDraggedTodo(null);
    setDragPosition(null);
  };

  const handleTodoDrop = async (todoItem: TodoItem, date: Date) => {
    console.log('Todo dropped on calendar:', todoItem.text, 'at date:', date);
    
    try {
      // Update the todo's due date
      await handleUpdateDueDate(todoItem.id, date);
      
      // Also mark the todo as being on the calendar
      const { error } = await supabase
        .from('todos')
        .update({ is_on_calendar: true })
        .eq('id', todoItem.id);
        
      if (error) {
        console.error('Error updating todo is_on_calendar status:', error);
      }
      
      // Refresh the todos to show the updated status
      fetchTodos();
    } catch (error) {
      console.error('Error handling todo drop:', error);
    }
    
    // Clear the dragged todo
    clearDraggedTodo();
  };

  // Add this function to handle todo due date updates when events are moved
  const handleTodoEventMoved = (todoId: string, newDate: Date) => {
    console.log('Calendar event moved, updating todo:', todoId, 'to date:', newDate);
    
    // Update the todo item's due date
    handleUpdateDueDate(todoId, newDate);
  };

  // First, add this function to determine the color based on todo status
  const getTodoBarColor = (todo: TodoItem): string => {
    if (todo.is_on_calendar) {
      return '#4285F4'; // Blue for calendar items
    } else if (todo.completed) {
      return '#34A853'; // Green for completed todos
    } else if (todo.due_date && new Date(todo.due_date) < new Date()) {
      return '#EA4335'; // Red for overdue todos
    } else if (todo.due_date && new Date(todo.due_date).toDateString() === new Date().toDateString()) {
      return '#FBBC05'; // Yellow for today's todos
    } else if (todo.archived) {
      return '#9AA0A6'; // Grey for archived todos
    } else if (todo.snooze_time) {
      return '#A142F4'; // Purple for snoozed todos
    }
    
    return '#9575CD'; // Default color
  };

  const renderTodoItem = ({ item, index }: { item: TodoItem, index: number }) => {
    const nextItem = todos[index + 1];
    const prevItem = todos[index - 1];
    
    const isLastCompleted = item.completed && (!nextItem || !nextItem.completed);
    const currentDate = item.due_date ? new Date(item.due_date).toDateString() : null;
    const nextDate = nextItem?.due_date ? new Date(nextItem.due_date).toDateString() : null;
    const prevDate = prevItem?.due_date ? new Date(prevItem.due_date).toDateString() : null;
    const isLastInDateGroup = !item.completed && currentDate !== nextDate;
    
    const isFirstInGroup = item.completed ? 
      (!prevItem || !prevItem.completed) : 
      (currentDate !== prevDate);
    const isLastInGroup = isLastCompleted || isLastInDateGroup;

    // Calculate number of week boundaries between two dates
    // where a week boundary is defined as the midnight between Sunday and Monday
    const getWeekBoundaryCount = (): number => {
      if (item.completed) return 0;
      if (!item.due_date || !nextItem?.due_date) return 0;
      
      const date1 = new Date(item.due_date);
      const date2 = new Date(nextItem.due_date);

      if (date1.getTime() === date2.getTime()) return 0;
      
      // Ensure we're working with the earlier and later date
      const [earlierDate, laterDate] = date1 < date2 ? [date1, date2] : [date2, date1];
      
      let count = 0;
      const current = new Date(earlierDate);
      current.setDate(current.getDate() + 1); // Start from the next day

      while (current.getTime() / (1000 * 60 * 60 * 24) <= laterDate.getTime() / (1000 * 60 * 60 * 24)) {
        if (current.getDay() === 1) { // Monday
          count++;
        }
        current.setDate(current.getDate() + 1);
      }

      return count;
    };

    // Update the itemProps object to properly handle drag events
    const itemProps = {
      draggable: !tagMode, // Don't allow dragging in tag mode
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('todoItem', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'move';
      }
    };

    return (
      <>
        <Swipeable
          renderRightActions={(dragX) => renderRightActions(dragX, item)}
          onSwipeableOpen={(direction) => {
            if (direction === 'right') {
              // existing code...
            }
          }}
        >
          <TouchableWithoutFeedback
            disabled={!tagMode}
            style={[
              styles.todoItemTouchable,
              tagMode && styles.todoItemTagMode
            ]}
            {...itemProps}
          >
            <ThemedView 
              data-todo-id={item.id}
              style={[
                styles.todoItem,
                isFirstInGroup && styles.firstInGroup,
                isLastInGroup && styles.lastInGroup,
                !isFirstInGroup && !isLastInGroup && styles.middleItem,
              ]}
            >
              <TouchableOpacity 
                style={styles.checkbox}
                onPress={() => toggleTodoComplete(item.id, item.completed)}
                disabled={tagMode}
              >
                {item.completed && <ThemedText style={styles.checkmark}>✓</ThemedText>}
              </TouchableOpacity>
              
              <ThemedView style={styles.todoTextContainer}>
                {editingTodoId === item.id ? (
                  <TextInput
                    value={editingText}
                    onChangeText={setEditingText}
                    style={[styles.todoTextContent, styles.editInput]}
                    autoFocus
                    onBlur={() => {
                      if (editingText.trim() !== '') {
                        handleUpdateTodoText(item.id, editingText);
                      }
                      setEditingTodoId(null);
                    }}
                    onSubmitEditing={() => {
                      if (editingText.trim() !== '') {
                        handleUpdateTodoText(item.id, editingText);
                      }
                      setEditingTodoId(null);
                    }}
                  />
                ) : (
                  <TouchableOpacity 
                    onPress={() => {
                      if (tagMode) {
                        handleTodoClick(item);
                        return;
                      }
                      if (Platform.OS === 'web') {
                        let lastClick = (item as any).lastClick;
                        const currentTime = new Date().getTime();
                        if (lastClick && currentTime - lastClick < 300) {
                          setEditingTodoId(item.id);
                          setEditingText(item.text);
                        }
                        (item as any).lastClick = currentTime;
                      }
                    }}
                    onLongPress={() => {
                      if (!tagMode && Platform.OS !== 'web') {
                        setEditingTodoId(item.id);
                        setEditingText(item.text);
                      }
                    }}
                    style={styles.todoTextWrapper}
                  >
                    <ThemedText style={[
                      styles.todoTextContent,
                      item.completed && styles.completedText
                    ]}>
                      {item.text}
                    </ThemedText>
                  </TouchableOpacity>
                )}
                {item.due_date && (
                  <TouchableOpacity onPress={(event) => showDatePickerAtPosition(event, item.id)}>
                    <ThemedText style={[
                      styles.metaText, 
                      new Date(item.due_date) < new Date() ? styles.overdue : null,
                      new Date(item.due_date).toDateString() === new Date().toDateString() ? styles.today : null
                    ]}>
                      {new Date(item.due_date).toLocaleString('en-US', { weekday: 'short' }) + ', ' + 
                       new Date(item.due_date).toLocaleString('en-US', { month: 'numeric', day: 'numeric' })}
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </ThemedView>
              <ThemedView style={styles.todoMetaIcons}>
                {item.archived && (
                  <ThemedText style={styles.metaIcon}>📦</ThemedText>
                )}
                {item.snooze_time && (
                  <ThemedText style={styles.metaIcon}>💤</ThemedText>
                )}
                {item.is_on_calendar && (
                  <ThemedText style={styles.metaIcon}>📅</ThemedText>
                )}
                <TouchableOpacity 
                  style={styles.calendarButton}
                  onPress={(event) => showDatePickerAtPosition(event, item.id)}
                >
                  <CalendarIcon date={item.due_date ? new Date(item.due_date) : undefined} />
                </TouchableOpacity>
              </ThemedView>
              <TouchableOpacity 
                style={[
                  styles.todoColorBar,
                  { backgroundColor: getTodoBarColor(item) },
                  pressedColorBarId === item.id && styles.todoColorBarPressed
                ]}
                onPress={() => setDraggedTodo(item)}
                onPressIn={() => setPressedColorBarId(item.id)}
                onPressOut={() => setPressedColorBarId(null)}
              />
            </ThemedView>
          </TouchableWithoutFeedback>
        </Swipeable>
        {Array.from({ length: getWeekBoundaryCount() }, (_, i) => (
          <ThemedView key={`divider-${item.id}-${i}`} style={styles.weekDivider} />
        ))}
      </>
    );
  };

  const renderDatePicker = () => {
    if (Platform.OS === 'web') {
      return (
        <ThemedView 
          style={[
            styles.webDatePickerContainer,
            datePickerPosition && {
              position: 'absolute',
              left: datePickerPosition.x - 150,
              top: datePickerPosition.y + 10,
            }
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              if (selectedTodoId) {
                handleUpdateDueDate(selectedTodoId, null);
              }
              setShowDatePicker(false);
              setDatePickerPosition(null);
            }}
            style={styles.clearDateButton}
          >
            <ThemedText style={styles.clearDateText}>Clear Date</ThemedText>
          </TouchableOpacity>
          <input
            type="date"
            onChange={(e) => {
              const date = e.target.value ? new Date(e.target.value + 'T12:00:00') : null;
              if (selectedTodoId) {
                handleUpdateDueDate(selectedTodoId, date);
              }
              setShowDatePicker(false);
              setDatePickerPosition(null);
            }}
            style={{
              opacity: 0,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              zIndex: -1,
            }}
            onClick={(e: any) => e.target.showPicker()}
            ref={(input) => {
              if (input) {
                setTimeout(() => input.showPicker(), 0);
              }
            }}
          />
        </ThemedView>
      );
    }

    return (
      <ThemedView>
        <TouchableOpacity
          style={styles.clearDateButton}
          onPress={() => {
            if (selectedTodoId) {
              handleUpdateDueDate(selectedTodoId, null);
            }
            setShowDatePicker(false);
            setDatePickerPosition(null);
          }}
        >
          <ThemedText style={styles.clearDateText}>Clear Date</ThemedText>
        </TouchableOpacity>
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'android' ? 'calendar' : 'inline'}
          onChange={onDateChange}
        />
      </ThemedView>
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTodos();
    setRefreshing(false);
  };

  const getItemLayout = (_: any, index: number) => ({
    length: itemHeight,
    offset: itemHeight * index,
    index,
  });

  const handleScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const currentTime = Date.now();
    const timeDiff = currentTime - lastScrollTime;
    
    if (timeDiff > 0) {
      const velocity = (currentY - lastScrollY) / timeDiff; // pixels per millisecond
      
      if (velocity < keyboardDismissOffset) {
        Keyboard.dismiss();
      }
    }
    
    setLastScrollY(currentY);
    setLastScrollTime(currentTime);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DndProvider backend={HTML5Backend}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <LinearGradient
            colors={['#3B82F6', '#9333EA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.container,
              Platform.OS !== 'web' && { paddingBottom: tabBarHeight }
            ]}
          >
            <ThemedView style={styles.layoutContainer}>
              <ThemedView style={styles.todoListContainer}>
                <ThemedText type="title">Todo List</ThemedText>
                
                <FlatList
                  data={todos}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTodoItem}
                  style={styles.todoList}
                  contentContainerStyle={styles.listContent}
                  getItemLayout={getItemLayout}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      tintColor="#ffffff"
                    />
                  }
                  ListEmptyComponent={
                    <ThemedText style={styles.emptyListText}>
                      No todos yet. Add one below!
                    </ThemedText>
                  }
                />

                <ThemedView style={styles.inputContainer}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Add a new todo..."
                    placeholderTextColor="#666"
                    onSubmitEditing={handleAddTodo}
                  />
                  <TagMenu />
                  <TouchableOpacity 
                    style={styles.addButton}  
                    onPress={handleAddTodo}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.addButtonText}>Add</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              </ThemedView>
              
              {Platform.OS === 'web' && (
                <ThemedView style={styles.calendarContainer}>
                  <GoogleCalendar 
                    onTodoDrop={handleTodoDrop}
                    draggedTodo={draggedTodo}
                    clearDraggedTodo={clearDraggedTodo}
                    onTodoEventMoved={handleTodoEventMoved}
                  />
                </ThemedView>
              )}
            </ThemedView>

            {showDatePicker && (
              <>
                <TouchableOpacity 
                  style={styles.datePickerBackdrop} 
                  onPress={() => {
                    setShowDatePicker(false);
                    setDatePickerPosition(null);
                  }}
                />
                {Platform.OS === 'web' ? (
                  renderDatePicker()
                ) : (
                  renderDatePicker()
                )}
              </>
            )}
            <TouchableOpacity 
              style={styles.signOutButton} 
              onPress={() => supabase.auth.signOut()}
            >
              <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
            </TouchableOpacity>
            <SettingsMenu />
          </LinearGradient>
        </KeyboardAvoidingView>
      </DndProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 0,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'transparent',
    marginTop: 'auto',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 48,
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 80,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      '::-webkit-scrollbar': {
        width: '8px',
      },
      '::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '::-webkit-scrollbar-thumb': {
        background: 'rgba(255, 255, 255, 0.3)',
        borderRadius: '4px',
      },
      '::-webkit-scrollbar-thumb:hover': {
        background: 'rgba(255, 255, 255, 0.5)',
      },
      'scrollbar-width': 'thin',
      'scrollbar-color': 'rgba(255, 255, 255, 0.3) transparent',
    } : {
      marginRight: -12,
      paddingRight: 12,
    }),
  },
  todoItem: {
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 8,
    paddingVertical: 0,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    ...(Platform.OS === 'web' ? {
      maxWidth: 390,
      alignSelf: 'center',
      width: '100%',
    } : {}),
  },
  todoTextWrapper: {
    flex: 1,
    paddingVertical: 4,
  },
  todoTextContent: {
    fontSize: 16,
    color: '#333',
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: 'bold',
    padding: 20,
  },
  listContent: {
    gap: 0,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  todoTextContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  todoMetaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  metaText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
  },
  overdue: {
    color: '#FF3B30',
  },
  today: {
    color: '#9333EA', // purple for today's tasks
  },
  calendarButton: {
    padding: 8,
  },
  calendarIconContainer: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  calendarHeader: {
    height: 6,
    width: '100%',
  },
  calendarDay: {
    fontSize: 12,
    textAlign: 'center',
    flex: 1,
    textAlignVertical: 'center',
    paddingTop: 0,
    marginTop: -4,
  },
  webDatePickerContainer: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  autoDateToggle: {
    padding: 8,
    marginHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    width: 48,
    height: 48,
  },
  autoDateToggleActive: {
    backgroundColor: 'rgba(0, 122, 255, 1)',
  },
  datePickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  clearDateButton: {
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 10,
  },
  clearDateText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  editInput: {
    padding: 0,
    margin: 0,
    color: '#333',
    flex: 1,
    minHeight: 20,
    fontSize: 16,
    flexWrap: 'wrap',
  },
  firstInGroup: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  lastInGroup: {
    marginBottom: 10, // Adds space after the last item in a date group
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  middleItem: {
    // Add any additional styles for the middle item if needed
  },
  weekDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 10,
    marginHorizontal: Platform.OS === 'web' ? 'auto' : 0,
    width: Platform.OS === 'web' ? '390px' : '100%',
  },
  signOutButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 20,
    padding: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 14,
  },
  tagButton: {
    width: 48,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  tagButtonIcon: {
    fontSize: 24,
  },
  tagMenuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  tagMenuContainer: {
    position: 'absolute',
    bottom: 70, // Position above the input container
    right: 100, // Position relative to the right side, adjust as needed
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    width: 200,
    zIndex: 1000,
  },
  tagOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 6,
    position: 'relative',
    minHeight: 48,
  },
  tagOptionSelected: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  tagOptionIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    display: 'flex',
  },
  tagOptionLabel: {
    fontSize: 16,
    color: '#333',
  },
  tagOptionLabelSelected: {
    fontWeight: 'bold',
  },
  rightActions: {
    flexDirection: 'row',
    height: '100%',
  },
  actionButton: {
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  actionText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  archiveAction: {
    backgroundColor: '#007AFF',
  },
  todoTagButton: {
    padding: 8,
    marginLeft: 4,
  },
  todoTagIcon: {
    fontSize: 16,
  },
  tagButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  todoItemTouchable: {
    width: '100%',
  },
  todoItemTagMode: {
    opacity: 0.8,
    cursor: 'pointer',
  },
  settingsButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 100, // Position to the left of sign out button
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  settingsIcon: {
    fontSize: 16,
  },
  settingsBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  settingsMenuContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 70, // Position below the settings button
    right: 80,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    width: 200,
    zIndex: 1000,
  },
  settingsOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 6,
  },
  settingsOptionLabel: {
    fontSize: 16,
    color: '#333',
  },
  todoMetaIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    backgroundColor: 'transparent',
  },
  metaIcon: {
    fontSize: 16,
    marginLeft: 4,
  },
  layoutContainer: {
    flex: 1,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  todoListContainer: {
    flex: 1,
    width: Platform.OS === 'web' ? '40%' : '100%',
    backgroundColor: 'transparent',
  },
  calendarContainer: {
    display: Platform.OS === 'web' ? 'flex' : 'none',
    width: Platform.OS === 'web' ? '60%' : '0%',
    paddingLeft: Platform.OS === 'web' ? 20 : 0,
    backgroundColor: 'transparent',
  },
  todoList: {
    flex: 1,
    width: '100%',
  },
  emptyListText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
  dragHandle: {
    padding: 6,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {
      cursor: 'grab' as any,
    } : {}),
  },
  todoColorBar: {
    width: 6,
    alignSelf: 'stretch',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    marginLeft: 4,
    marginRight: -8,
  },
  todoColorBarPressed: {
    opacity: 0.7,
    width: 10, // Make it slightly wider when pressed for visual feedback
  },
});
