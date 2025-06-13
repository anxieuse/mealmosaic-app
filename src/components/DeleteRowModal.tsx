import React, { useState } from 'react';
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface DeleteRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowData: any;
  headers: string[];
  rowIndex: number;
  onDelete: () => Promise<{ success: boolean; message: string }>;
}

export const DeleteRowModal: React.FC<DeleteRowModalProps> = ({
  isOpen,
  onClose,
  rowData,
  headers,
  rowIndex,
  onDelete
}) => {
  const { theme } = useTheme();
  const [isDeleting, setIsDeleting] = useState(false);
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  const handleDelete = async () => {
    setIsDeleting(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const result = await onDelete();
      
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
        message: error instanceof Error ? error.message : 'Failed to delete row' 
      });
    } finally {
      setIsDeleting(false);
    }
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
      <div className={`relative w-full max-w-md p-6 rounded-lg shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Delete Row
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

        {/* Warning */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-red-700 font-medium text-sm">
              Are you sure you want to delete this row?
            </p>
            <p className="text-red-600 text-xs mt-1">
              This action cannot be undone and will permanently modify your CSV file.
            </p>
          </div>
        </div>

        {/* Row Preview */}
        <div className={`mb-4 p-3 rounded border ${
          theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-sm font-medium mb-2 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
          }`}>
            Row #{rowIndex + 1} Data:
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {headers.slice(0, 5).map((header) => (
              <div key={header} className="flex justify-between text-sm">
                <span className={`font-medium ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {header}:
                </span>
                <span className={`truncate ml-2 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-800'
                }`}>
                  {rowData[header] || '—'}
                </span>
              </div>
            ))}
            {headers.length > 5 && (
              <div className={`text-sm italic ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                ... and {headers.length - 5} more fields
              </div>
            )}
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
            disabled={isDeleting}
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
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors text-sm"
            >
              {isDeleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              {isDeleting ? 'Deleting...' : 'Delete Row'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 