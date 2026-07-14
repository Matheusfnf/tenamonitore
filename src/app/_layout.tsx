import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { database } from '@/db';
import { appTheme } from '@/lib/theme';
import { SyncProvider } from '@/sync/SyncProvider';

function RootNavigator() {
  const { initializing, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [initializing, session, segments, router]);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider
          theme={appTheme}
          settings={{
            icon: ({ name, color, size }) => (
              <MaterialCommunityIcons name={name as any} color={color} size={size} />
            ),
          }}
        >
          <DatabaseProvider database={database}>
            <AuthProvider>
              <SyncProvider>
                <RootNavigator />
              </SyncProvider>
            </AuthProvider>
          </DatabaseProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
