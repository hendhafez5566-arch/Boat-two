'use client';
import { createContext, useContext, ReactNode } from 'react';
export type PublicBrand = {
  hostname: string;
  tenantId: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  widgetTitle: string;
};
const Brand = createContext<PublicBrand | null>(null);
export function BrandProvider({
  brand,
  children,
}: {
  brand: PublicBrand | null;
  children: ReactNode;
}) {
  return <Brand.Provider value={brand}>{children}</Brand.Provider>;
}
export const useBrand = () => useContext(Brand);
