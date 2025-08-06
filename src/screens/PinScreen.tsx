import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from './navigations/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Importa el logo correctamente con require
const logo = require('./assets/alma_logo.jpg'); // ajusta la ruta si tu archivo está más arriba

const API_URL = 'https://fichajes-empresa.onrender.com';
const API_SECRET = '5jT$9uZpL#xqR2mEo1W8';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Pin'>;

export default function PinScreen() {
  const [pin, setPin] = useState('');
  const navigation = useNavigation<NavigationProp>();

  useFocusEffect(
    useCallback(() => {
      setPin('');
    }, [])
  );

  const handlePress = async (num: string) => {
    const newPin = pin + num;
    if (newPin.length <= 4) setPin(newPin);

    if (newPin.length === 4) {
      try {
        const response = await fetch(`${API_URL}/api/users/by-pin/${newPin}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_SECRET}`,
          },
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Respuesta no válida del servidor');
        }

        const data = await response.json();

        if (!response.ok || !data || !data.name) {
          Alert.alert('Error', data.message || 'PIN inválido');
          setPin('');
          return;
        }

        if (data.role === 'admin') {
          navigation.navigate('AdminPanel');
        } else {
          navigation.navigate('EntryExit', {
            userName: data.name,
            pin: newPin,
          });
        }
      } catch (error) {
        console.error('Error al verificar el PIN:', error);
        Alert.alert('Error', 'No se pudo verificar el PIN');
        setPin('');
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const renderButton = (value: string, onPress: () => void, extraStyle = {}) => (
    <TouchableOpacity style={[styles.button, extraStyle]} onPress={onPress}>
      <Text style={styles.buttonText}>{value}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Image source={logo} style={styles.logo} />
      <Text style={styles.instructionText}>Introduzca PIN</Text>

      <View style={styles.pinBox}>
        {[...Array(4)].map((_, i) => (
          <View key={i} style={styles.pinDot}>
            <Text style={styles.pinDotText}>{pin[i] ? '●' : ''}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) =>
          renderButton(num, () => handlePress(num))
        )}
      </View>

      <View style={styles.bottomRow}>
        {renderButton('0', () => handlePress('0'))}
        {renderButton('←', handleDelete, { backgroundColor: '#dc3545' })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  instructionText: { fontSize: 22, fontWeight: '600', marginBottom: 10, color: '#333' },
  logo: { width: 140, height: 140, marginBottom: 20, resizeMode: 'contain' },
  pinBox: { flexDirection: 'row', marginBottom: 40, gap: 20 },
  pinDot: { width: 24, height: 24, borderBottomWidth: 2, borderColor: '#999', alignItems: 'center', justifyContent: 'center' },
  pinDotText: { fontSize: 20, color: '#333' },
  grid: { width: 240, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  bottomRow: { marginTop: 10, width: 240, flexDirection: 'row', justifyContent: 'center' },
  button: {
    width: 70,
    height: 70,
    margin: 5,
    borderRadius: 35,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { fontSize: 28, color: '#fff', fontWeight: '600' },
});
