'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
const Locale = createContext({
  language: 'ar',
  toggle: () => {},
  t: (ar: string, en: string) => {
    void en;
    return ar;
  },
});
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState('ar');
  useEffect(() => {
    setLanguage(localStorage.getItem('boat-language') === 'en' ? 'en' : 'ar');
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  const toggle = () =>
    setLanguage((l) => {
      const n = l === 'ar' ? 'en' : 'ar';
      localStorage.setItem('boat-language', n);
      return n;
    });
  return (
    <Locale.Provider value={{ language, toggle, t: (ar, en) => (language === 'ar' ? ar : en) }}>
      {children}
    </Locale.Provider>
  );
}
export const useLocale = () => useContext(Locale);
