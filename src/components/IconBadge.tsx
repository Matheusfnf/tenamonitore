import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

/** Quadrado arredondado com ícone colorido — usado nos cards do painel. */
export function IconBadge({
  icon,
  color,
  background,
  size = 44,
}: {
  icon: string;
  color: string;
  background: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: background, width: size, height: size },
      ]}
    >
      <MaterialCommunityIcons
        name={icon as any}
        size={size * 0.55}
        color={color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
