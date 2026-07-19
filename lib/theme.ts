import { createTheme } from '@mui/material';
import type { ThemeMode } from './theme-context';

export function getAppTheme(mode: ThemeMode) {
  const isDark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? '#91b4ff' : '#1b3a6b',
        dark: isDark ? '#b8ccff' : '#122b52',
        light: isDark ? '#273a62' : '#e8eef8',
      },
      secondary: {
        main: '#f59e0b',
      },
      background: {
        default: isDark ? '#181a20' : '#f7f9fc',
        paper: isDark ? '#22252d' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f4f7fb' : '#172033',
        secondary: isDark ? '#aeb7c7' : '#687386',
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
        '"Noto Sans Thai", "Leelawadee UI", Tahoma, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h4: {
        fontWeight: 800,
        letterSpacing: '-0.02em',
      },
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
            borderRadius: 10,
            boxShadow: 'none',
            paddingInline: 16,
          },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            minWidth: 44,
            minHeight: 44,
            borderRadius: 10,
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
            borderColor: isDark ? '#343945' : '#e1e6ef',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: isDark ? '#91b4ff' : '#1b3a6b',
            height: 3,
            borderRadius: 3,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 52,
            color: isDark ? '#aeb7c7' : '#687386',
            fontWeight: 700,
            '&.Mui-selected': {
              color: isDark ? '#91b4ff' : '#1b3a6b',
            },
          },
        },
      },
    },
  });
}
