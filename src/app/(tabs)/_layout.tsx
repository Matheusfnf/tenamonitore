import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { palette } from '@/lib/theme';

function tabIcon(name: string) {
  const TabIcon = ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name as any} color={color as string} size={size} />
  );
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.green,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.outline,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Início', tabBarIcon: tabIcon('home-variant-outline') }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: 'Mapa', tabBarIcon: tabIcon('map-outline') }}
      />
      <Tabs.Screen
        name="visits"
        options={{ title: 'Visitas', tabBarIcon: tabIcon('clipboard-text-outline') }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: 'Relatórios', tabBarIcon: tabIcon('file-document-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: tabIcon('account-outline') }}
      />
      {/* Fazendas navega DENTRO das abas (barra visível), mas não vira aba. */}
      <Tabs.Screen name="farms" options={{ href: null }} />
    </Tabs>
  );
}
