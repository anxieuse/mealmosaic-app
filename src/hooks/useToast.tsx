import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ToastContainer } from '../components/ToastContainer';
import { ToastProps } from '../components/Toast';

interface ToastContextType {
  addToast: (toast: Omit<ToastProps, 'id' | 'onClose'>) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Omit<ToastProps, 'id' | 'onClose'>>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const addToast = (toast: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: ToastProps = {
      ...toast,
      id,
      onClose: removeToast
    };
    
    setToasts(prev => [...prev, newToast]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const updateToast = (id: string, updates: Partial<Omit<ToastProps, 'id' | 'onClose'>>) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id 
        ? { ...toast, ...updates }
        : toast
    ));
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast, updateToast }}>
      {children}
      <ToastContainer toasts={toasts} onCloseToast={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}; 