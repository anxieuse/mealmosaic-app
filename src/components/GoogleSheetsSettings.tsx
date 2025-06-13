import React, { useState, useEffect } from 'react';
import { ExternalLink, Save, Loader2, Plus, History, X, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useTheme } from '../context/ThemeContext';
import { CreateSheetModal } from './CreateSheetModal';

export const GoogleSheetsSettings: React.FC = () => {
  const { theme } = useTheme();
  const { 
    googleSheetsUrl, 
    tabName,
    urlHistory, 
    setGoogleSheetsUrl, 
    setTabName,
    addUrlToHistory,
    removeUrlFromHistory,
    clearUrlHistory,
    isSettingUrl 
  } = useGoogleSheets();
  const [inputUrl, setInputUrl] = useState(googleSheetsUrl);
  const [inputTabName, setInputTabName] = useState(tabName);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Sync local input states with context when they change (e.g., after creating a new sheet)
  useEffect(() => {
    setInputUrl(googleSheetsUrl);
  }, [googleSheetsUrl]);

  useEffect(() => {
    setInputTabName(tabName);
  }, [tabName]);

  const handleSaveUrl = async () => {
    if (!inputUrl.trim()) {
      setError('Please enter a Google Sheets URL');
      return;
    }

    setError('');
    setSuccess('');

    try {
      await setGoogleSheetsUrl(inputUrl.trim());
      addUrlToHistory(inputUrl.trim());
      setSuccess('Google Sheets URL saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save URL');
    }
  };

  const handleSaveTabName = () => {
    setTabName(inputTabName.trim() || 'Продукты');
    setSuccess('Tab name updated successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSelectHistoryUrl = (url: string) => {
    setInputUrl(url);
    setShowHistory(false);
  };

  const openGoogleSheets = () => {
    if (googleSheetsUrl) {
      window.open(googleSheetsUrl, '_blank');
    }
  };

  return (
    <div className={`p-2 rounded-lg border ${
      theme === 'dark' 
        ? 'bg-gray-800 border-gray-700' 
        : 'bg-white border-gray-200'
    }`}>
      {/* Header Row */}
      <div className={`flex items-center justify-between ${!isCollapsed ? 'mb-4' : ''} h-10`}>        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            className={`p-1 rounded transition-colors ${
              theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            {isCollapsed ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </button>
          <h3 className={`text-lg font-semibold ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Google Sheets Integration
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            <Plus size={14} />
            Create New Sheet
          </button>
          {googleSheetsUrl && (
            <button
              onClick={openGoogleSheets}
              className="flex items-center gap-2 px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              <ExternalLink size={14} />
              Open Sheet
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="space-y-4">
          {/* Tab Name */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Tab Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputTabName}
                onChange={(e) => setInputTabName(e.target.value)}
                placeholder="Продукты"
                className={`flex-1 px-3 py-2 border rounded-md text-sm ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
              <button
                onClick={handleSaveTabName}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm"
              >
                <Save size={14} />
                Save
              </button>
            </div>
            <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Specify which tab/sheet to append rows to. If tab doesn't exist, it will be created.
            </p>
          </div>

          {/* Google Sheets URL */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Google Sheets URL
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit"
                  className={`w-full px-3 py-2 pr-10 border rounded-md text-sm ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                />
                {urlHistory.length > 0 && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-opacity-10 ${
                      theme === 'dark' ? 'hover:bg-white text-gray-300' : 'hover:bg-black text-gray-600'
                    }`}
                    title="Show URL history"
                  >
                    <History size={16} />
                  </button>
                )}
              </div>
              <button
                onClick={handleSaveUrl}
                disabled={isSettingUrl}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors text-sm"
              >
                {isSettingUrl ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save
              </button>
            </div>
            
            {/* URL History Dropdown */}
            {showHistory && urlHistory.length > 0 && (
              <div className={`mt-2 p-2 border rounded-md ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Recent URLs
                  </span>
                  <button
                    onClick={clearUrlHistory}
                    className={`p-1 rounded hover:bg-opacity-10 ${
                      theme === 'dark' ? 'hover:bg-white text-gray-400' : 'hover:bg-black text-gray-500'
                    }`}
                    title="Clear history"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {urlHistory.map((url, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelectHistoryUrl(url)}
                        className={`flex-1 text-left text-sm p-2 rounded hover:bg-opacity-10 truncate ${
                          theme === 'dark' 
                            ? 'hover:bg-white text-gray-300' 
                            : 'hover:bg-black text-gray-600'
                        }`}
                        title={url}
                      >
                        {url}
                      </button>
                      <button
                        onClick={() => removeUrlFromHistory(url)}
                        className={`p-1 rounded hover:bg-opacity-10 ${
                          theme === 'dark' ? 'hover:bg-white text-gray-400' : 'hover:bg-black text-gray-500'
                        }`}
                        title="Remove from history"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-md text-sm">
              {success}
            </div>
          )}
        </div>
      )}

      <CreateSheetModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}; 