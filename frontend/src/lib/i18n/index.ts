import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import tr from './locales/tr.json'

const savedLang =
  typeof window !== 'undefined'
    ? localStorage.getItem('app_language') || 'en'
    : 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export function changeLanguage(lang: string) {
  i18n.changeLanguage(lang)
  localStorage.setItem('app_language', lang)
}

export default i18n
