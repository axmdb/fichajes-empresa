import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const API_URL = 'https://fichajes-empresa.onrender.com';
const API_SECRET = '5jT$9uZpL#xqR2mEo1W8';

type User = { _id: string; name: string; pin: string };

export default function DeleteUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const navigation = useNavigation();

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`);
      const data: User[] = await res.json();
      setUsers(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los usuarios');
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert(
      '¿Estás seguro?',
      'Esta acción eliminará al usuario permanentemente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => handleDelete(id) },
      ]
    );
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${API_SECRET}` },
      });

      if (res.ok) {
        Alert.alert('Eliminado', 'Usuario eliminado correctamente');
        fetchUsers();
      } else {
        Alert.alert('Error', 'No se pudo eliminar');
      }
    } catch {
      Alert.alert('Error de conexión');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Eliminar Usuarios</Text>

      <FlatList
        data={users}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.userRow}>
            <Text style={styles.userText}>{item.name} (PIN: {item.pin})</Text>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item._id)}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={[styles.button, styles.backButton]} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>VOLVER</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f2f2f2' },
  title: { fontSize: 24, marginBottom: 20, textAlign: 'center', fontWeight: 'bold' },
  userRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  userText: { fontSize: 16, color: '#333' },
  deleteButton: { backgroundColor: '#ff6b6b', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  deleteText: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  backButton: { backgroundColor: '#999' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
