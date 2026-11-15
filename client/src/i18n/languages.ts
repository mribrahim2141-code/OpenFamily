export interface LanguageConfig {
    label: string;
}

export const LANGUAGE_CONFIG: Record<string, LanguageConfig> = {
    ar: { label: 'العربية' },
    fr: { label: 'FR' },
    en: { label: 'EN' },
    pt: { label: 'PT-BR' },
    ru: { label: 'RU' },
    zh: { label: '中文' },
    es: { label: 'ES' },
    de: { label: 'DE' },
};

export const CONFIGURED_LANGUAGE_ORDER = Object.keys(LANGUAGE_CONFIG);
