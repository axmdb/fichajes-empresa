import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import Signature from 'react-native-signature-canvas';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './navigations/types';

const API_URL = 'https://fichajes-empresa.onrender.com';
const API_SECRET = '5jT$9uZpL#xqR2mEo1W8';

type SignatureRouteProp = RouteProp<RootStackParamList, 'Signature'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SignatureScreen() {
  const ref = useRef<any>(null);
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SignatureRouteProp>();
  const { userName, pin, type } = route.params;

  const [signature, setSignature] = useState<string | null>(null);

  const handleOK = (sig: string) => setSignature(sig);
  const handleEnd = () => ref.current.readSignature();

  const handleSubmit = async () => {
    if (!signature) {
      Alert.alert('Error', 'Por favor, firme antes de confirmar.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/firma`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ pin, signature, type }),
      });

      if (res.ok) {
        Alert.alert('✅ Firma registrada', 'Gracias por confirmar tu fichaje', [
          { text: 'OK', onPress: () => navigation.navigate('Pin') },
        ]);
      } else {
        Alert.alert('Error', 'No se pudo guardar la firma.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Firma de {userName}</Text>

      <View style={styles.signatureWrapper}>
        <Signature
          ref={ref}
          onOK={handleOK}
          onEnd={handleEnd}
          descriptionText="Firme dentro del recuadro"
          clearText="Limpiar"
          confirmText="Guardar"
          autoClear={false}
          imageType="image/png"
          webStyle={`.m-signature-pad--footer { display: none; }`}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.submitButton,
          { backgroundColor: signature ? '#4CAF50' : '#9E9E9E' },
        ]}
        onPress={handleSubmit}
        disabled={!signature}
      >
        <Text style={styles.buttonText}>Confirmar Firma</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f8ff', paddingHorizontal: 20, paddingTop: 10, justifyContent: 'flex-start' },
  header: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#333' },
  signatureWrapper: { height: 300, borderRadius: 10, overflow: 'hidden', borderColor: '#ccc', borderWidth: 1 },
  submitButton: { paddingVertical: 15, borderRadius: 8, marginTop: 20, marginBottom: 30, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18 },
});
