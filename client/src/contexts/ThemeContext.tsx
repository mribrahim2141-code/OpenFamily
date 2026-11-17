import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GlassSettings, readGlassSettings, saveGlassSettings } from '../design/glassSettings';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    actualTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const GlassSettingsContext = createContext<{glassSettings:GlassSettings;setGlassSettings:(settings:GlassSettings)=>void}|undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem('theme') as Theme;
        return stored || 'system';
    });

    const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');
    const [glassSettings, setGlassSettingsState] = useState<GlassSettings>(() => readGlassSettings());
    const setGlassSettings = (settings: GlassSettings) => setGlassSettingsState(saveGlassSettings(settings));

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        let effectiveTheme: 'light' | 'dark';

        if (theme === 'system') {
            effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
        } else {
            effectiveTheme = theme;
        }

        root.classList.add(effectiveTheme);
        setActualTheme(effectiveTheme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        saveGlassSettings(glassSettings);
    }, [glassSettings]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
            <GlassSettingsContext.Provider value={{glassSettings,setGlassSettings}}>
                {children}
            </GlassSettingsContext.Provider>
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export const useGlassSettings = () => {
    const context = useContext(GlassSettingsContext);
    if (context === undefined) throw new Error('useGlassSettings must be used within a ThemeProvider');
    return context;
};
