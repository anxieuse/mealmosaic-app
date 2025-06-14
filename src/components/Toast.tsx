import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';

export interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'loading';
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Auto-close timer (except for loading toasts)
    if (type !== 'loading' && duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [type, duration]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(id), 300); // Wait for fade-out animation
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={20} className="text-green-500 flex-shrink-0" />;
      case 'error':
        return <AlertCircle size={20} className="text-red-500 flex-shrink-0" />;
      case 'loading':
        return <Loader2 size={20} className="text-blue-500 flex-shrink-0 animate-spin" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'loading':
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div
      className={`transform transition-all duration-300 ease-out ${
        isVisible 
          ? 'translate-x-0 opacity-100' 
          : '-translate-x-full opacity-0'
      }`}
    >
      <div className={`w-80 p-4 rounded-lg border shadow-lg ${getBgColor()}`}>
        <div className="flex items-start gap-3">
          {getIcon()}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {title}
            </p>
            {message && (
              <p className="text-sm text-gray-600 mt-1">
                {message}
              </p>
            )}
          </div>
          {type !== 'loading' && (
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
            >
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 