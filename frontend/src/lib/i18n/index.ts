import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

const savedLang =
  typeof window !== 'undefined'
    ? localStorage.getItem('app_language') || 'en'
    : 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en', // always start with EN; TR loaded lazily below
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

// Lazy-load non-default locales on demand — keeps TR out of the initial bundle
async function ensureLocale(lang: string) {
  if (lang === 'tr' && !i18n.hasResourceBundle('tr', 'translation')) {
    const { default: tr } = await import('./locales/tr.json')
    i18n.addResourceBundle('tr', 'translation', tr, true, true)
  }
}

export async function changeLanguage(lang: string) {
  await ensureLocale(lang)
  await i18n.changeLanguage(lang)
  if (typeof window !== 'undefined') localStorage.setItem('app_language', lang)
}

// Apply saved language on startup (runs once on import)
if (savedLang !== 'en') {
  void ensureLocale(savedLang).then(() => i18n.changeLanguage(savedLang))
}

export default i18n
