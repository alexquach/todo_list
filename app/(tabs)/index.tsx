import { StyleSheet, TextInput, TouchableOpacity, FlatList, Animated } from 'react-native';
import { useState, useEffect } from 'react';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { supabase } from '@/lib/supabase';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

export default function HomeScreen() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTodos(data || []);
    } catch (error) {
      console.error('Error fetching todos:', error);
    }
  };

  const handleAddTodo = async () => {
    if (inputText.trim().length > 0) {
      const newTodo: TodoItem = {
        id: Date.now().toString(),
        text: inputText,
        completed: false
      };
      
      try {
        const { error } = await supabase
          .from('todos')
          .insert([newTodo]);

        if (error) throw error;
        
        setTodos(currentTodos => [...currentTodos, newTodo]);
        setInputText('');
      } catch (error) {
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

  const renderTodoItem = ({ item }: { item: TodoItem }) => (
    <Swipeable
      renderRightActions={(progress, dragX) => 
        renderRightActions(dragX, item.id)
      }
      rightThreshold={-100}
    >
      <ThemedView style={styles.todoItem}>
        <ThemedText style={styles.todoTextContent}>
          {item.text}
        </ThemedText>
      </ThemedView>
    </Swipeable>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Todo List</ThemedText>
        
        <ThemedView style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Add a new todo..."
            placeholderTextColor="#666"
            onSubmitEditing={handleAddTodo}
            returnKeyType="done"
          />
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
        />
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 10,
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
  },
  todoItem: {
    backgroundColor: '#f8f8f8',
    padding: 16,
    marginBottom: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  todoTextContent: {
    fontSize: 16,
    color: '#333',
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
});
