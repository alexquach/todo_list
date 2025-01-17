import { StyleSheet, TextInput, TouchableOpacity, FlatList, Animated, Platform, RefreshControl } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  created_at: string;
}

interface DatePickerPosition {
  x: number;
  y: number;
}

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

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('completed', { ascending: true })
        .order('due_date', { ascending: true, nullsLast: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTodos(data || []);
    } catch (error) {
      console.error('Error fetching todos:', error);
    }
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

      const newTodo: TodoItem = {
        id: Date.now().toString(),
        text: inputText,
        completed: false,
        completed_at: null,
        due_date: autoSetDueDate ? today.toISOString() : null,
        created_at: new Date().toISOString()
      };
      
      try {
        const { error } = await supabase
          .from('todos')
          .insert([newTodo]);

        if (error) throw error;
        
        setTodos(currentTodos => sortTodos([...currentTodos, newTodo]));
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
      // First, sort by completion status
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      
      // Then, sort by due date (nulls last)
      if (a.due_date !== b.due_date) {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      
      // Finally, sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };


  const toggleTodoComplete = async (id: string, completed: boolean) => {
    try {
      if (Platform.OS !== 'web') {
        if (!completed) {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          );
        } else {
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
      const due_date = date ? date.toISOString() : null;
      
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
      // Set time to noon
      selectedDate.setHours(12, 0, 0, 0);
      handleUpdateDueDate(selectedTodoId, selectedDate);
    }
  };

  const renderRightActions = (dragX: Animated.AnimatedInterpolation<number>, id: string) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => deleteTodo(id)}
      >
        <Animated.Text 
          style={[
            styles.deleteActionText,
            { transform: [{ scale }] }
          ]}
        >
          Delete
        </Animated.Text>
      </TouchableOpacity>
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

  const renderTodoItem = ({ item }: { item: TodoItem }) => (
    <Swipeable
      renderRightActions={(progress, dragX) => 
        renderRightActions(dragX, item.id)
      }
      rightThreshold={-100}
    >
      <ThemedView style={styles.todoItem}>
        <TouchableOpacity 
          style={styles.checkbox}
          onPress={() => toggleTodoComplete(item.id, item.completed)}
        >
          {item.completed && <ThemedText style={styles.checkmark}>✓</ThemedText>}
        </TouchableOpacity>
        <ThemedView style={styles.todoTextContainer}>
          <ThemedText style={[
            styles.todoTextContent,
            item.completed && styles.completedText
          ]}>
            {item.text}
          </ThemedText>
          {item.due_date && (
            <TouchableOpacity onPress={(event) => showDatePickerAtPosition(event, item.id)}>
              <ThemedText style={[styles.metaText, 
                new Date(item.due_date) < new Date() ? styles.overdue : null
              ]}>
                {new Date(item.due_date).toLocaleString('en-US', { weekday: 'short' }) + ', ' + new Date(item.due_date).toLocaleString('en-US', { month: 'numeric', day: 'numeric' })}
              </ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>
        <TouchableOpacity 
          style={styles.calendarButton}
          onPress={(event) => showDatePickerAtPosition(event, item.id)}
        >
          <ThemedText style={styles.calendarIcon}>📅</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </Swipeable>
  );

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
              padding: 10,
              fontSize: 16,
              border: '1px solid #ccc',
              borderRadius: 8,
              position: 'relative',
              '::-webkit-calendar-picker-indicator': {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
              }
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
      <DateTimePicker
        value={selectedDate}
        mode="date"
        display={Platform.OS === 'android' ? 'calendar' : 'inline'}
        onChange={onDateChange}
      />
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTodos();
    setRefreshing(false);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient
        colors={['#3B82F6', '#9333EA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.container,
          Platform.OS !== 'web' && { paddingBottom: tabBarHeight }
        ]}
      >
        <ThemedText type="title">Todo List</ThemedText>
        
        <ThemedView style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Add a new todo..."
            placeholderTextColor="#666"
            onSubmitEditing={handleAddTodo}
            returnKeyType="done"
          />
          <TouchableOpacity 
            style={[styles.autoDateToggle, autoSetDueDate && styles.autoDateToggleActive]} 
            onPress={() => setAutoSetDueDate(!autoSetDueDate)}
          >
            <ThemedText style={styles.autoDateToggleText}>📅</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton} 
            onPress={handleAddTodo}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.addButtonText}>Add</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <FlatList
          data={todos}
          keyExtractor={(item) => item.id}
          renderItem={renderTodoItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#ffffff"
              colors={['#ffffff']}
              progressBackgroundColor="#3B82F6"
            />
          }
        />
        
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
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
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
    padding: 8,
    marginBottom: 2,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {
      maxWidth: 390, // Match container width
      alignSelf: 'center',
      width: '100%',
    } : {}),
  },
  todoTextContent: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 100,
    height: '100%',
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: 'bold',
    padding: 20,
  },
  listContent: {
    gap: 10,
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
  calendarButton: {
    padding: 8,
    marginLeft: 8,
  },
  calendarIcon: {
    fontSize: 20,
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
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  autoDateToggleActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  autoDateToggleText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  datePickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});
