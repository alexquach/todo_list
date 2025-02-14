import { NativeModules } from 'react-native';

interface DynamicIslandPayload {
    type: 'taskCount';
    data: {
        count: number;
    };
}

console.log('Available Native Modules:', Object.keys(NativeModules));

export const setDynamicIsland = (payload: DynamicIslandPayload) => {
    console.log('DynamicIslandModule:', NativeModules.DynamicIslandModule);
    
    // Add a small delay to ensure module is ready
    setTimeout(() => {
        try {
            console.log('Calling updateDynamicIsland with:', payload);
            NativeModules.DynamicIslandModule.updateDynamicIsland(payload);
            console.log('Message sent to Dynamic Island');
        } catch (error) {
            console.error('Error updating Dynamic Island:', error);
        }
    }, 100);
};