import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { CSVProvider } from './context/CSVContext';
import { Layout } from './components/Layout';
import { CSVViewer } from './components/CSVViewer';
import { ToastProvider } from './hooks/useToast';
import { GoogleSheetsProvider } from './context/GoogleSheetsContext';

function App() {
  return (
    <ThemeProvider>
      <CSVProvider>
        <ToastProvider>
          <GoogleSheetsProvider>
            <AppContent />
          </GoogleSheetsProvider>
        </ToastProvider>
      </CSVProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  return (
    <Layout>
      <CSVViewer />
    </Layout>
  );
}

export default App;