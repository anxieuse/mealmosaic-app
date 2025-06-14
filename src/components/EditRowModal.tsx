import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface EditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowData: any;
  headers: string[];
  onSave: (updatedData: any) => Promise<{ success: boolean; message: string }>;
}

export const EditRowModal: React.FC<EditRowModalProps> = ({
  isOpen,
  onClose,
  rowData,
  headers,
  onSave
}) => {
  const { theme } = useTheme();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  useEffect(() => {
    if (isOpen && rowData) {
      // Initialize form data with current row values
      const initialData: Record<string, string> = {};
      headers.forEach(header => {
        initialData[header] = rowData[header] || '';
      });
      setFormData(initialData);
      setStatus({ type: 'idle', message: '' });
    }
  }, [isOpen, rowData, headers]);

  const handleInputChange = (header: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [header]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const result = await onSave(formData);
      
      if (result.success) {
        setStatus({ type: 'success', message: result.message });
        // Auto-close after 1.5 seconds on success
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setStatus({ type: 'error', message: result.message });
      }
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to save changes' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = () => {
    return headers.some(header => {
      const originalValue = rowData[header] || '';
      const currentValue = formData[header] || '';
      return originalValue !== currentValue;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-2xl max-h-[80vh] p-6 rounded-lg shadow-lg overflow-hidden ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Edit Row
          </h3>
          <button
            onClick={onClose}
            className={`p-1 rounded hover:bg-opacity-10 transition-colors ${
              theme === 'dark' ? 'hover:bg-white' : 'hover:bg-black'
            }`}
          >
            <X size={20} className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} />
          </button>
        </div>

        {/* Form Fields */}
        <div className="overflow-y-auto max-h-96 mb-4">
          <div className="grid gap-4">
            {headers.map((header) => (
              <div key={header}>
                <label className={`block text-sm font-medium mb-1 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {header}
                </label>
                <input
                  type="text"
                  value={formData[header] || ''}
                  onChange={(e) => handleInputChange(header, e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md text-sm ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder={`Enter ${header}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Status Display */}
        {status.message && (
          <div className={`mb-4 p-3 rounded border text-sm ${
            status.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : status.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-gray-300'
              : 'bg-gray-50 border-gray-200 text-gray-700'
          }`}>
            {status.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSaving}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            } disabled:opacity-50`}
          >
            {status.type === 'success' ? 'Close' : 'Cancel'}
          </button>
          
          {status.type !== 'success' && (
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors text-sm"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 