import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { isSupabaseConfigured } from '@/lib/env';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <Text variant="headlineMedium" style={styles.title}>
            TenaMonitore
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Monitoramento de talhões e visitas técnicas
          </Text>

          {!isSupabaseConfigured && (
            <Banner visible icon="alert" style={styles.banner}>
              Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e
              EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo .env e reinicie o app.
            </Banner>
          )}

          <TextInput
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            right={
              <TextInput.Icon
                icon={showPass ? 'eye-off' : 'eye'}
                onPress={() => setShowPass((v) => !v)}
              />
            }
            mode="outlined"
            style={styles.input}
          />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          <Button
            mode="contained"
            onPress={onSubmit}
            loading={loading}
            disabled={loading || !email || !password}
            style={styles.button}
          >
            Entrar
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: { textAlign: 'center', fontWeight: '700' },
  subtitle: { textAlign: 'center', marginBottom: 16, opacity: 0.7 },
  banner: { marginBottom: 12 },
  input: { backgroundColor: 'transparent' },
  error: { color: '#B3261E' },
  button: { marginTop: 8, paddingVertical: 4 },
});
