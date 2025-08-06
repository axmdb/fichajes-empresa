import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './navigations/types';

type SignatureRouteProp = RouteProp<RootStackParamList, 'Signature'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Sustituimos el uso de @env por valores directos
const API_URL = 'https://fichajes-empresa.onrender.com';
const API_SECRET = '5jT$9uZpL#xqR2mEo1W8';

export default function EntryExitScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SignatureRouteProp>();
  const { userName, pin } = route.params;

  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [desayunoIniciado, setDesayunoIniciado] = useState(false);

  useEffect(() => {
    const fetchEstado = async () => {
      try {
        const res = await fetch(`${API_URL}/api/fichaje/estado?pin=${pin}`);
        const data = await res.json();
        if (res.ok) {
          setDesayunoIniciado(data.desayunoIniciado);
        } else {
          console.warn('No se pudo obtener el estado de fichaje.');
        }
      } catch (err) {
        console.warn('Error al obtener estado:', err);
      }
    };

    fetchEstado();
  }, [pin]);

  const fichar = async (type: 'entrada' | 'salida' | 'desayuno_inicio' | 'desayuno_fin') => {
    setLoadingType(type);

    try {
      const res = await fetch(`${API_URL}/api/fichaje`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ pin, type }),
      });

      const data = await res.json();

      if (res.ok) {
        const now = new Date();
        const hora = now.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const fecha = now.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });

        const mensaje =
          type === 'entrada'
            ? 'Entrada'
            : type === 'salida'
            ? 'Salida'
            : type === 'desayuno_inicio'
            ? 'Inicio desayuno'
            : 'Fin desayuno';

        if (type === 'desayuno_inicio') setDesayunoIniciado(true);
        if (type === 'desayuno_fin') setDesayunoIniciado(false);

        Alert.alert(
          '✅ Fichaje exitoso',
          `${mensaje} registrado a las ${hora}\n${fecha}`,
          [{ text: 'OK', onPress: () => navigation.navigate('Signature', { userName, pin, type }) }]
        );
      } else {
        Alert.alert('Error', data.message || 'Fallo al fichar');
      }
    } catch (err) {
      Alert.alert('Error de conexión', 'No se pudo contactar con el servidor');
    } finally {
      setLoadingType(null);
    }
  };

  const getButtonStyle = (type: string, color: string) => ({
    backgroundColor: loadingType === type ? '#ccc' : color,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>¡Bienvenid@, {userName}!</Text>
      <Text style={styles.subtitle}>Selecciona una opción:</Text>

      <TouchableOpacity
        style={[styles.button, getButtonStyle('entrada', '#4CAF50')]}
        onPress={() => fichar('entrada')}
        disabled={loadingType !== null}
      >
        <Text style={styles.buttonText}>Entrada</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          getButtonStyle(desayunoIniciado ? 'desayuno_fin' : 'desayuno_inicio', '#FFA726'),
        ]}
        onPress={() => fichar(desayunoIniciado ? 'desayuno_fin' : 'desayuno_inicio')}
        disabled={loadingType !== null}
      >
        <Text style={styles.buttonText}>
          {desayunoIniciado ? 'Fin desayuno' : 'Inicio desayuno'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, getButtonStyle('salida', '#f44336')]}
        onPress={() => fichar('salida')}
        disabled={loadingType !== null}
      >
        <Text style={styles.buttonText}>Salida</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f0f8ff',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 30,
    color: '#666',
  },
  button: {
    padding: 15,
    marginVertical: 10,
    borderRadius: 10,
    width: 200,
    alignItems: 'center',
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
  },
});
