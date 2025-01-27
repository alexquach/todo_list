import { StyleSheet, Platform, Dimensions } from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { LineChart, BarChart } from 'react-native-chart-kit';

interface DailyStats {
  date: string;
  count: number;
}

export default function TabTwoScreen() {
  const [weeklyStats, setWeeklyStats] = useState<DailyStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<DailyStats[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Get current date and dates for last week/month
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      const monthAgo = new Date(now);
      monthAgo.setDate(now.getDate() - 30);

      const { data: completedTasks, error } = await supabase
        .from('todos')
        .select('completed_at')
        .not('completed_at', 'is', null)
        .gte('completed_at', monthAgo.toISOString());

      if (error) throw error;

      // Process data for weekly stats
      const weeklyData = processStats(completedTasks, weekAgo, now);
      setWeeklyStats(weeklyData);

      // Process data for monthly stats
      const monthlyData = processStats(completedTasks, monthAgo, now);
      setMonthlyStats(monthlyData);

    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const processStats = (tasks: any[], startDate: Date, endDate: Date): DailyStats[] => {
    const stats: { [key: string]: number } = {};
    
    // Initialize all dates in range with 0
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      stats[dateStr] = 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Count completed tasks per day
    tasks.forEach((task) => {
      if (task.completed_at) {
        const dateStr = new Date(task.completed_at).toISOString().split('T')[0];
        if (stats[dateStr] !== undefined) {
          stats[dateStr]++;
        }
      }
    });

    // Convert to array format
    return Object.entries(stats).map(([date, count]) => ({
      date,
      count
    }));
  };

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, // Blue color
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#3B82F6',
    },
  };

  const getChartData = () => {
    const data = viewMode === 'week' ? weeklyStats : monthlyStats;
    return {
      labels: data.map(stat => 
        viewMode === 'week'
          ? new Date(stat.date).toLocaleDateString('en-US', { weekday: 'short' })
          : new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      ),
      datasets: [{
        data: data.map(stat => stat.count),
      }],
    };
  };

  return (
    <LinearGradient
      colors={['#3B82F6', '#9333EA']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.container}
    >
      <ThemedText type="title">Task Statistics</ThemedText>
      
      <ThemedView style={styles.toggleContainer}>
        <ThemedView 
          style={[
            styles.toggleButton, 
            viewMode === 'week' && styles.toggleButtonActive
          ]}
          onTouchEnd={() => setViewMode('week')}
          onClick={() => setViewMode('week')}
        >
          <ThemedText style={[
            styles.toggleText,
            viewMode === 'week' && styles.toggleTextActive
          ]}>Week</ThemedText>
        </ThemedView>
        <ThemedView 
          style={[
            styles.toggleButton,
            viewMode === 'month' && styles.toggleButtonActive
          ]}
          onTouchEnd={() => setViewMode('month')}
          onClick={() => setViewMode('month')}
        >
          <ThemedText style={[
            styles.toggleText,
            viewMode === 'month' && styles.toggleTextActive
          ]}>Month</ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.chartContainer}>
        {viewMode === 'week' ? (
          <BarChart
            data={getChartData()}
            width={Dimensions.get('window').width - 80}
            height={220}
            yAxisLabel=""
            chartConfig={chartConfig}
            style={styles.chart}
            showValuesOnTopOfBars
            fromZero
          />
        ) : (
          <LineChart
            data={getChartData()}
            width={Dimensions.get('window').width - 80}
            height={220}
            yAxisLabel=""
            chartConfig={chartConfig}
            style={styles.chart}
            bezier
            fromZero
          />
        )}
      </ThemedView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 4,
    marginVertical: 20,
    alignSelf: 'center',
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  toggleText: {
    color: '#fff',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#3B82F6',
  },
  chartContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
    padding: 10,
  },
});
