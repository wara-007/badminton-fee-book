import { createTheme } from '@mui/material';
import type { ThemeMode } from './theme-context';

export function getAppTheme(mode: ThemeMode) {
  const isDark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? '#8fb3ff' : '#05247a',
      },
      secondary: {
        main: '#f59e0b',
      },
      background: {
        default: isDark ? '#1a1a1a' : '#f7f5ef',
        paper: isDark ? '#252525' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f3f4f6' : '#1f2933',
        secondary: isDark ? '#9ca3af' : '#5f6c7b',
      },
      error: {
        main: '#ef4444',
      },
      warning: {
        main: '#f59e0b',
      },
    },
    shape: {
      borderRadius: 8,
    },
    typography: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      button: {
        textTransform: 'none',
        fontWeight: 700,
      },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            minHeight: 44,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: isDark ? '#333333' : '#e7e2d8',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: isDark ? '#8fb3ff' : '#05247a',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            color: isDark ? '#9ca3af' : '#5f6c7b',
            '&.Mui-selected': {
              color: isDark ? '#8fb3ff' : '#05247a',
            },
          },
        },
      },
    },
  });
}
