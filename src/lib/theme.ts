import { MD3LightTheme } from 'react-native-paper';

/**
 * Paleta do TenaMonitore — verde agro sobre fundo claro neutro.
 * Cores auxiliares (badges de ícone, pills de status) ficam em `palette`;
 * o `appTheme` alimenta o react-native-paper (MD3).
 */
export const palette = {
  green: '#2E7D32',
  greenDark: '#1B5E20',
  greenSoft: '#E7F3E8',
  purple: '#5E35B1',
  purpleSoft: '#EDE7F6',
  amber: '#B26A00',
  amberSoft: '#FFF3E0',
  red: '#C62828',
  redSoft: '#FDECEA',
  blue: '#1565C0',
  blueSoft: '#E3F0FC',
  background: '#F6F8F6',
  surface: '#FFFFFF',
  outline: '#E3E9E3',
  text: '#1B1F1B',
  textMuted: '#68716A',
};

export const appTheme: typeof MD3LightTheme = {
  ...MD3LightTheme,
  roundness: 4,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.green,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.greenSoft,
    onPrimaryContainer: palette.greenDark,
    secondaryContainer: palette.greenSoft,
    onSecondaryContainer: palette.greenDark,
    background: palette.background,
    onBackground: palette.text,
    surface: palette.surface,
    onSurface: palette.text,
    surfaceVariant: '#EDF2ED',
    onSurfaceVariant: palette.textMuted,
    outline: '#C9D3C9',
    outlineVariant: palette.outline,
    error: palette.red,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: '#FFFFFF',
      level2: '#FFFFFF',
      level3: '#FFFFFF',
    },
  },
};
