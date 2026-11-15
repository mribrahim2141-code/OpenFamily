import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { CONFIGURED_LANGUAGE_ORDER } from './languages';

const modules = import.meta.glob('./locales/*/*.json', { eager: true });
type NamespaceBundle = Record<string, unknown>;
const resources: Record<string, Record<string, NamespaceBundle>> = {};

for (const filePath in modules) {
    const match = filePath.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const [, lng, ns] = match;
    const mod = modules[filePath] as { default: NamespaceBundle };
    if (!resources[lng]) resources[lng] = {};
    resources[lng][ns] = mod.default;
}

const discovered = Object.keys(resources);
export const SUPPORTED_LANGUAGES: string[] = [
    ...CONFIGURED_LANGUAGE_ORDER.filter((l) => discovered.includes(l)),
    ...discovered.filter((l) => !CONFIGURED_LANGUAGE_ORDER.includes(l)).sort(),
];

const namespaces = Array.from(new Set(Object.values(resources).flatMap((r) => Object.keys(r))));

const syncDocumentLanguage = (language?: string) => {
    const lng = (language || i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    const isRtl = lng === 'ar' || lng === 'fa' || lng === 'ur' || lng === 'he';
    if (typeof document !== 'undefined') {
        document.documentElement.lang = lng;
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    }
};

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        supportedLngs: SUPPORTED_LANGUAGES.length ? SUPPORTED_LANGUAGES : ['en'],
        fallbackLng: 'en',
        load: 'languageOnly',
        nonExplicitSupportedLngs: true,
        ns: namespaces.length ? namespaces : ['common'],
        defaultNS: 'common',
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'i18nextLng',
            caches: ['localStorage'],
        },
        interpolation: { escapeValue: false },
        returnNull: false,
        saveMissing: import.meta.env.DEV,
        missingKeyHandler: (_lngs: readonly string[], ns: string, key: string) => {
            if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${ns}:${key}`);
        },
    })
    .then(() => syncDocumentLanguage());

i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
