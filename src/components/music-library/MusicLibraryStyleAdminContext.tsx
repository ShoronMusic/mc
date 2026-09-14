'use client';

import { createContext, useContext, type ReactNode } from 'react';

const MusicLibraryStyleAdminContext = createContext(false);

export function MusicLibraryStyleAdminProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return (
    <MusicLibraryStyleAdminContext.Provider value={value}>{children}</MusicLibraryStyleAdminContext.Provider>
  );
}

export function useMusicLibraryStyleAdmin(): boolean {
  return useContext(MusicLibraryStyleAdminContext);
}
