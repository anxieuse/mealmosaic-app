import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface GoogleSheetsContextType {
  googleSheetsUrl: string;
  tabName: string;
  urlHistory: string[];
  setGoogleSheetsUrl: (url: string) => void;
  setTabName: (name: string) => void;
  addUrlToHistory: (url: string) => void;
  removeUrlFromHistory: (url: string) => void;
  clearUrlHistory: () => void;
  isSettingUrl: boolean;
  isAppendingRow: boolean;
  appendRowToSheet: (rowData: any[], headers: string[]) => Promise<{ success: boolean; message: string }>;
}

const GoogleSheetsContext = createContext<GoogleSheetsContextType | undefined>(undefined);

const STORAGE_KEYS = {
  URL: 'googleSheetsUrl',
  TAB_NAME: 'googleSheetsTabName',
  URL_HISTORY: 'googleSheetsUrlHistory'
};

export const GoogleSheetsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [googleSheetsUrl, setGoogleSheetsUrlState] = useState<string>('');
  const [tabName, setTabNameState] = useState<string>('Продукты');
  const [urlHistory, setUrlHistoryState] = useState<string[]>([]);
  const [isSettingUrl, setIsSettingUrl] = useState(false);
  const [isAppendingRow, setIsAppendingRow] = useState(false);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem(STORAGE_KEYS.URL) || '';
    const savedTabName = localStorage.getItem(STORAGE_KEYS.TAB_NAME) || 'Продукты';
    const savedHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.URL_HISTORY) || '[]');

    setGoogleSheetsUrlState(savedUrl);
    setTabNameState(savedTabName);
    setUrlHistoryState(savedHistory);
  }, []);

  const setGoogleSheetsUrl = useCallback(async (url: string) => {
    setIsSettingUrl(true);
    try {
      const response = await fetch('http://localhost:3001/api/google-sheets/set-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set Google Sheets URL');
      }

      setGoogleSheetsUrlState(url);
      localStorage.setItem(STORAGE_KEYS.URL, url);
    } catch (error) {
      console.error('Error setting Google Sheets URL:', error);
      throw error;
    } finally {
      setIsSettingUrl(false);
    }
  }, []);

  const setTabName = useCallback((name: string) => {
    setTabNameState(name);
    localStorage.setItem(STORAGE_KEYS.TAB_NAME, name);
  }, []);

  const addUrlToHistory = useCallback((url: string) => {
    if (!url || url.trim() === '') return;

    setUrlHistoryState(prev => {
      const newHistory = [url, ...prev.filter(u => u !== url)].slice(0, 10); // Keep last 10 unique URLs
      localStorage.setItem(STORAGE_KEYS.URL_HISTORY, JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const removeUrlFromHistory = useCallback((url: string) => {
    setUrlHistoryState(prev => {
      const newHistory = prev.filter(u => u !== url);
      localStorage.setItem(STORAGE_KEYS.URL_HISTORY, JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const clearUrlHistory = useCallback(() => {
    setUrlHistoryState([]);
    localStorage.removeItem(STORAGE_KEYS.URL_HISTORY);
  }, []);

  const appendRowToSheet = useCallback(async (rowData: any[], headers: string[]) => {
    setIsAppendingRow(true);
    try {
      const response = await fetch('http://localhost:3001/api/google-sheets/append', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rowData,
          webAppHeaders: headers,
          tabName: tabName || 'Продукты' // Include tab name in request
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to append row to Google Sheets');
      }

      return { success: true, message: result.message };
    } catch (error) {
      console.error('Error appending row to Google Sheets:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to append row to Google Sheets' 
      };
    } finally {
      setIsAppendingRow(false);
    }
  }, [tabName]);

  const value = {
    googleSheetsUrl,
    tabName,
    urlHistory,
    setGoogleSheetsUrl,
    setTabName,
    addUrlToHistory,
    removeUrlFromHistory,
    clearUrlHistory,
    isSettingUrl,
    isAppendingRow,
    appendRowToSheet,
  };

  return (
    <GoogleSheetsContext.Provider value={value}>
      {children}
    </GoogleSheetsContext.Provider>
  );
};

export const useGoogleSheets = () => {
  const context = useContext(GoogleSheetsContext);
  if (!context) {
    throw new Error('useGoogleSheets must be used within a GoogleSheetsProvider');
  }
  return context;
}; 