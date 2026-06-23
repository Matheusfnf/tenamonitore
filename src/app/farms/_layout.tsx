import { Stack } from 'expo-router';

export default function FarmsLayout() {
  // As telas usam Appbar do Paper; o header nativo fica oculto.
  return <Stack screenOptions={{ headerShown: false }} />;
}
