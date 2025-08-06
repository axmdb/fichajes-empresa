import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './navigations/types'; // Ajusta la ruta si es necesario

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'AdminPanel'>;

export default function AdminPanelScreen() {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel de Administración</Text>

      <View style={styles.buttonContainer}>
        <Button title="➕ Crear Usuario" onPress={() => navigation.navigate('CreateUsers')} />
      </View>

      <View style={styles.buttonContainer}>
        <Button title="🗑️ Eliminar Usuarios" onPress={() => navigation.navigate('DeleteUsers')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, marginBottom: 30, textAlign: 'center' },
  buttonContainer: {
    marginVertical: 10,
    width: '80%',
  },
});
