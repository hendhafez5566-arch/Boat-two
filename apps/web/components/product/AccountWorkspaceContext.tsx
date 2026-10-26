'use client';
import { createContext, useContext } from 'react';
export const AccountWorkspaceContext = createContext(false);
export const useEmbeddedAccount = () => useContext(AccountWorkspaceContext);
