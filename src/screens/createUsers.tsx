import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const API_URL = 'https://fichajes-empresa.onrender.com';
const API_SECRET = '5jT$9uZpL#xqR2mEo1W8';

export default function CreateUsers() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const navigation = useNavigation();

  const handleCreate = async () => {
    if (!name || !pin) return Alert.alert('Error', 'Rellena todos los campos');
    if (!/^\d{4}$/.test(pin)) return Alert.alert('Error', 'El PIN debe tener 4 dígitos numéricos');

    try {
      const res = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ name, pin, role: 'user' }),
      });

      const data = await res.json();

      if (res.ok) {
        Alert.alert('✅ Éxito', 'Usuario creado correctamente');
        setName('');
        setPin('');
      } else {
        Alert.alert('Error', data.message || 'No se pudo crear el usuario');
      }
    } catch (err) {
      Alert.alert('Error de conexión', 'No se pudo contactar con el servidor');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Usuario</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
        value={name}
        onChangeText={setName}
        placeholderTextColor="#999"
      />

      <TextInput
        style={styles.input}
        placeholder="PIN (4 dígitos)"
        value={pin}
        onChangeText={setPin}
        keyboardType="numeric"
        maxLength={4}
        placeholderTextColor="#999"
      />

      <TouchableOpacity style={styles.buttonCreate} onPress={handleCreate}>
        <Text style={styles.buttonText}>CREAR</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonBack} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>VOLVER</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#f2f2f2' },
  title: { fontSize: 26, marginBottom: 30, textAlign: 'center', fontWeight: '600', color: '#333' },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 15, paddingVertical: 12, fontSize: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  buttonCreate: {
    backgroundColor: '#2196F3', paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', elevation: 3, marginBottom: 14,
  },
  buttonBack: {
    backgroundColor: '#bbb', paddingVertical: 14, borderRadius: 10, alignItems: 'center', elevation: 2,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
