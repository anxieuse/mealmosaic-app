import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../hooks/useToast';
import { useGoogleSheets } from '../context/GoogleSheetsContext';

interface CreateSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateSheetModal: React.FC<CreateSheetModalProps> = ({
  isOpen,
  onClose
}) => {
  const { theme } = useTheme();
  const { addToast, updateToast } = useToast();
  const { setGoogleSheetsUrl, addUrlToHistory, setTabName } = useGoogleSheets();
  
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    sheetName: `mealmosaic_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}`,
    tabName: 'Продукты',
    headerRow: 'url\tname\tpri/we\tpro/cal\tweight\tprice\tcalories\tproteins\tfats\tcarbohydrates\tcontent\tdescription\tavailability\tcategory\taverage_rating\trating_count'
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Utility to parse header row supporting tab, comma, or space delimiters with quotes
  const parseHeaderRow = (input: string): string[] => {
    const headers: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (char === '"') {
        // Handle escaped quotes
        if (inQuotes && input[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && (char === '\t' || char === ',' || char === ' ')) {
        headers.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    headers.push(current.trim());
    return headers;
  };

  const handleCreateSheet = async () => {
    if (!formData.sheetName.trim()) {
      addToast({
        type: 'error',
        title: 'Sheet name required',
        message: 'Please enter a sheet name'
      });
      return;
    }

    setIsCreating(true);
    
    const toastId = addToast({
      type: 'loading',
      title: 'Creating Google Sheet...',
      message: 'Please wait while we create your new spreadsheet'
    });

    try {
      const response = await fetch('http://localhost:3001/api/google-sheets/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sheetTitle: formData.sheetName.trim(),
          tabName: formData.tabName.trim(),
          headers: parseHeaderRow(formData.headerRow),
          freezeRows: 1
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Update context with new URL and tab name
        setGoogleSheetsUrl(result.spreadsheetUrl);
        setTabName(formData.tabName.trim());
        addUrlToHistory(result.spreadsheetUrl);
        
        updateToast(toastId, {
          type: 'success',
          title: 'Google Sheet created successfully!',
          message: `Sheet "${formData.sheetName}" is ready for use`
        });
        
        onClose();
      } else {
        updateToast(toastId, {
          type: 'error',
          title: 'Failed to create Google Sheet',
          message: result.error || 'Unknown error occurred'
        });
      }
    } catch (error) {
      console.error('Error creating Google Sheet:', error);
      updateToast(toastId, {
        type: 'error',
        title: 'Failed to create Google Sheet',
        message: error instanceof Error ? error.message : 'Network or server error'
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`w-full max-w-2xl mx-4 p-6 rounded-lg shadow-xl ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Plus className={`w-5 h-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Create New Google Sheet
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'dark'
                ? 'hover:bg-gray-700 text-gray-300'
                : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Sheet Name */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Sheet Name
            </label>
            <input
              type="text"
              value={formData.sheetName}
              onChange={(e) => handleInputChange('sheetName', e.target.value)}
              disabled={isCreating}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              placeholder="Enter sheet name..."
            />
          </div>

          {/* Tab Name */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Tab Name
            </label>
            <input
              type="text"
              value={formData.tabName}
              onChange={(e) => handleInputChange('tabName', e.target.value)}
              disabled={isCreating}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              placeholder="Enter tab name..."
            />
          </div>

          {/* Header Row */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Header Row (tab / whitespace-separated, supports quotes)
            </label>
            <textarea
              value={formData.headerRow}
              onChange={(e) => handleInputChange('headerRow', e.target.value)}
              disabled={isCreating}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              placeholder="Enter headers separated by tabs, spaces, or commas. Use quotes for values containing delimiters..."
            />
            <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Separate column headers with tabs, spaces, or commas. Use quotes for values containing delimiters.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isCreating}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              theme === 'dark'
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateSheet}
            disabled={isCreating || !formData.sheetName.trim()}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isCreating || !formData.sheetName.trim()
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isCreating ? 'Creating...' : 'Create Sheet'}
          </button>
        </div>
      </div>
    </div>
  );
}; 