import React, { createContext, useContext, ReactNode } from 'react';
import { useCSVData } from '../hooks/useCSVData';

interface CSVContextType {
  structure: { [shop: string]: string[] };
  shops: string[];
  files: string[];
  selectedShop: string | null;
  selectedFile: string | null;
  setSelectedShop: (shop: string) => void;
  setSelectedFile: (file: string) => void;
  data: any[];
  headers: string[];
  loading: boolean;
  error: string | null;
  refreshData: () => void;
  refreshAll: () => void;
}

const CSVContext = createContext<CSVContextType | undefined>(undefined);

export const CSVProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const csvData = useCSVData();
  
  return (
    <CSVContext.Provider value={csvData}>
      {children}
    </CSVContext.Provider>
  );
};

export const useCSVContext = () => {
  const context = useContext(CSVContext);
  if (context === undefined) {
    throw new Error('useCSVContext must be used within a CSVProvider');
  }
  return context;
}; 