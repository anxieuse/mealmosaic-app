import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface ShopSelectorProps {
  shops: string[];
  selectedShop: string | null;
  onSelectShop: (shop: string) => void;
  loading?: boolean;
}

export const ShopSelector: React.FC<ShopSelectorProps> = ({ 
  shops, 
  selectedShop, 
  onSelectShop,
  loading = false
}) => {
  const { theme } = useTheme();
  
  if (loading) {
    return (
      <div className={`w-full h-12 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow flex items-center justify-center`}>
        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }
  
  return (
    <div className={`w-full overflow-x-auto ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow`}>
      <div className="flex p-2 gap-2">
        {shops.length === 0 ? (
          <div className={`px-4 py-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            No shops available
          </div>
        ) : (
          shops.map((shop) => (
            <button
              key={shop}
              onClick={() => onSelectShop(shop)}
              className={`px-4 py-2 rounded-md transition-colors whitespace-nowrap ${
                selectedShop === shop
                  ? 'bg-blue-500 text-white'
                  : `${theme === 'dark' 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'}`
              }`}
            >
              {shop}
            </button>
          ))
        )}
      </div>
    </div>
  );
}; 