// App.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/screens/navigations/types';

import PinScreen from './src/screens/PinScreen';
import EntryExitScreen from './src/screens/EntryExitScreen';
import AdminPanelScreen from './src/screens/AdminPanel';
import CreateUsersPanel from './src/screens/createUsers';
import DeleteUsersPanel from './src/screens/deleteUsers';
import SignatureScreen from './src/screens/SignatureScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Pin"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Pin" component={PinScreen} />
        <Stack.Screen name="EntryExit" component={EntryExitScreen} />
        <Stack.Screen name="AdminPanel" component={AdminPanelScreen} />
        <Stack.Screen name="CreateUsers" component={CreateUsersPanel} />
        <Stack.Screen name="DeleteUsers" component={DeleteUsersPanel} />
        <Stack.Screen
          name="Signature"
          component={SignatureScreen}
          options={{ headerShown: true }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
