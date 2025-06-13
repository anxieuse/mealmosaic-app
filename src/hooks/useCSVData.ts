import { useState, useEffect, useCallback, useReducer } from 'react';
import { GLOBAL_SEARCH_KEY } from '../config/global';

export interface CSVStructure {
  [shop: string]: string[];
}

interface State {
  structure: CSVStructure;
  selectedShop: string | null;
  selectedFile: string | null;
  data: any[];
  headers: string[];
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_STRUCTURE'; payload: CSVStructure }
  | { type: 'SET_SHOP'; payload: string }
  | { type: 'SET_FILE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_DATA'; payload: { data: any[]; headers: string[] } }
  | { type: 'CLEAR_DATA' };

const initialState: State = {
  structure: {},
  selectedShop: null,
  selectedFile: null,
  data: [],
  headers: [],
  loading: false,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STRUCTURE': {
      const structure = action.payload;
      const shops = Object.keys(structure);
      let newShop = state.selectedShop;
      let newFile = null;

      // If no shop selected or current shop doesn't exist in new structure, select first available
      if (!newShop || !structure[newShop]) {
        newShop = shops.length > 0 ? shops[0] : null;
      }

      // If shop is selected, get first available file
      if (newShop && structure[newShop]) {
        const files = structure[newShop];
        newFile = files.length > 0 ? files[0] : null;
      }

      return {
        ...state,
        structure,
        selectedShop: newShop,
        selectedFile: newFile,
      };
    }

    case 'SET_SHOP': {
      const shop = action.payload;
      const { structure } = state;
      let newFile = null;

      // Get first available file for this shop
      if (shop && structure[shop]) {
        const files = structure[shop];
        newFile = files.length > 0 ? files[0] : null;
      }

      return {
        ...state,
        selectedShop: shop,
        selectedFile: newFile,
        data: [],
        headers: [],
        error: null,
      };
    }

    case 'SET_FILE': {
      return {
        ...state,
        selectedFile: action.payload,
        data: [],
        headers: [],
        error: null,
      };
    }

    case 'SET_LOADING': {
      return {
        ...state,
        loading: action.payload,
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
    }

    case 'SET_DATA': {
      return {
        ...state,
        data: action.payload.data,
        headers: action.payload.headers,
        loading: false,
        error: null,
      };
    }

    case 'CLEAR_DATA': {
      return {
        ...state,
        data: [],
        headers: [],
        error: null,
      };
    }

    default:
      return state;
  }
}

export const useCSVData = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchStructure = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await fetch('/api/csv-structure');
      if (!response.ok) {
        throw new Error('Failed to fetch CSV structure');
      }
      const data = await response.json();
      dispatch({ type: 'SET_STRUCTURE', payload: data.shops });
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'An unknown error occurred' });
    }
  }, []);

  // initial fetch
  useEffect(() => { fetchStructure(); }, [fetchStructure]);

  // Fetch CSV data function
  const fetchCSVData = useCallback(async (shop: string, file: string) => {
    const isGlobal = file === GLOBAL_SEARCH_KEY;

    // Validate if not global
    if (!isGlobal && !state.structure[shop]?.includes(file)) {
      dispatch({ type: 'SET_ERROR', payload: 'Invalid shop/file combination' });
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      let url: string;
      if (isGlobal) {
        url = `/api/csv-data-global?shop=${encodeURIComponent(shop)}`;
      } else {
        url = `/api/csv-data?shop=${encodeURIComponent(shop)}&file=${encodeURIComponent(file)}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch CSV data');
      }
      const result = await response.json();
      dispatch({ type: 'SET_DATA', payload: { data: result.data, headers: result.headers } });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'An unknown error occurred' });
    }
  }, [state.structure]);

  // Fetch data when shop/file combination changes
  useEffect(() => {
    if (!state.selectedShop || !state.selectedFile) {
      dispatch({ type: 'CLEAR_DATA' });
      return;
    }

    const isGlobal = state.selectedFile === GLOBAL_SEARCH_KEY;

    // Only fetch if the combination is valid OR it's global search
    if (isGlobal || state.structure[state.selectedShop]?.includes(state.selectedFile)) {
      fetchCSVData(state.selectedShop, state.selectedFile);
    } else {
      // Invalid combination when not global
      dispatch({ type: 'SET_ERROR', payload: 'Invalid shop/file combination' });
    }
  }, [state.selectedShop, state.selectedFile, fetchCSVData]);

  // Refresh function to re-fetch current data
  const refreshData = useCallback(() => {
    if (state.selectedShop && state.selectedFile) {
      fetchCSVData(state.selectedShop, state.selectedFile);
    }
  }, [state.selectedShop, state.selectedFile, fetchCSVData]);

  const refreshAll = useCallback(async () => {
    await fetchStructure();
    refreshData();
  }, [fetchStructure, refreshData]);

  // Custom setters that handle cascading updates properly
  const setSelectedShop = useCallback((shop: string) => {
    dispatch({ type: 'SET_SHOP', payload: shop });
  }, []);

  const setSelectedFile = useCallback((file: string) => {
    dispatch({ type: 'SET_FILE', payload: file });
  }, []);

  // Get available shops
  const shops = Object.keys(state.structure);

  // Get available files for selected shop
  const files = state.selectedShop && state.structure[state.selectedShop] 
    ? state.structure[state.selectedShop] 
    : [];

  return {
    structure: state.structure,
    shops,
    files,
    selectedShop: state.selectedShop,
    selectedFile: state.selectedFile,
    setSelectedShop,
    setSelectedFile,
    data: state.data,
    headers: state.headers,
    loading: state.loading,
    error: state.error,
    refreshData,
    refreshAll
  };
};