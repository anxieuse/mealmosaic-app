import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import { google } from 'googleapis';
import { spawn, spawnSync } from 'child_process';
import readline from 'readline';
import os from 'os';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// -----------------------------------------------------------------------------
// Path helpers (works in ESM where __dirname is undefined)
// -----------------------------------------------------------------------------

// Emulate __filename / __dirname that exist in CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project-level directories (one level above /api)
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Re-usable constants for scraper locations
const VKUSVILL_DIR = path.join(PROJECT_ROOT, 'vkusvill-scraper');
const OZON_DIR = path.join(PROJECT_ROOT, 'ozon-scraper');

// Directory where CSV files are stored – always <project_root>/csv
const CSV_DIR = path.join(PROJECT_ROOT, 'csv');

// Create the CSV directory if it doesn't exist
if (!fs.existsSync(CSV_DIR)) {
  fs.mkdirSync(CSV_DIR, { recursive: true });
}

// Google Sheets configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

// Store Google Sheets URL and auth token (in production, use a database)
let googleSheetsUrl = '';
let oAuth2Client = null;

// Initialize Google Sheets API with OAuth2
const getGoogleSheetsAuth = async () => {
  const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  
  if (!credentialsPath || !fs.existsSync(credentialsPath)) {
    throw new Error('Google credentials file not found. Please check GOOGLE_SERVICE_ACCOUNT_KEY_PATH environment variable.');
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  
  // Check if it's OAuth2 credentials
  if (credentials.installed) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    // Use localhost redirect for OAuth2 callback
    const redirectUri = 'http://localhost:5173/oauth-callback.html';
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
    
    // For now, we'll need to handle token management
    // In production, you'd want to implement proper OAuth2 flow
    const tokenPath = path.resolve('./token.json');
    if (fs.existsSync(tokenPath)) {
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      oAuth2Client.setCredentials(token);
    }
    
    return oAuth2Client;
  } else if (credentials.type === 'service_account') {
    // Handle service account credentials
    return new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: SCOPES,
    });
  } else {
    throw new Error('Unsupported credential type. Please use service account or OAuth2 credentials.');
  }
};

// Extract spreadsheet ID from Google Sheets URL
const extractSpreadsheetId = (url) => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

// Function to normalize header names (remove BOM and other invisible characters)
const normalizeHeader = (header) => {
  return header.replace(/^\uFEFF/, '').trim();
};

// Add this near the top of the file with other imports
const activeProcesses = new Map();

// Helper to detect a usable Python binary (prefers env var, then python3, then python)
const detectPythonBinary = () => {
  // 1. Respect explicit env override
  if (process.env.PYTHON_BINARY && process.env.PYTHON_BINARY.trim() !== '') {
    return process.env.PYTHON_BINARY.trim();
  }

  // 2. Try common executable names, but return an *absolute* path resolved via `which`
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const whichRes = spawnSync('which', [cmd]);
      if (whichRes.status === 0) {
        const absPath = whichRes.stdout.toString().trim();
        if (absPath) {
          // Sanity-check the binary actually runs
          const verRes = spawnSync(absPath, ['--version']);
          if (verRes.status === 0) {
            return absPath;
          }
        }
      }
    } catch (_) {
      // ignore and continue searching
    }
  }

  // 3. Final fallback – hope that plain "python" is available in PATH
  return 'python';
};

// Endpoint to get the structure of shops and CSV files (flattened structure)
app.get('/api/csv-structure', (req, res) => {
  try {
    // Check if directory exists
    if (!fs.existsSync(CSV_DIR)) {
      return res.json({ shops: {} });
    }
    
    const structure = {};
    
    // Read shops (first level directories now)
    const shops = fs.readdirSync(CSV_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    shops.forEach(shop => {
      const shopPath = path.join(CSV_DIR, shop);
      
      // Read CSV files in each shop
      const csvFiles = fs.readdirSync(shopPath)
        .filter(file => file.toLowerCase().endsWith('.csv'));
      
      structure[shop] = csvFiles;
    });
    
    res.json({ shops: structure });
  } catch (error) {
    console.error('Error reading CSV structure:', error);
    res.status(500).json({ error: 'Failed to read CSV structure' });
  }
});

// Endpoint to get the list of CSV files (updated for flattened structure)
app.get('/api/csv-files', (req, res) => {
  try {
    const { shop } = req.query;
    
    // Check if directory exists
    if (!fs.existsSync(CSV_DIR)) {
      return res.json({ files: [] });
    }
    
    // If shop is provided, return files from that specific shop
    if (shop) {
      const shopPath = path.join(CSV_DIR, shop.toString());
      
      if (!fs.existsSync(shopPath)) {
        return res.json({ files: [] });
      }
      
      const files = fs.readdirSync(shopPath)
        .filter(file => file.toLowerCase().endsWith('.csv'));
      
      return res.json({ files });
    }
    
    // Fallback: return all CSV files (for backward compatibility)
    const allFiles = [];
    
    // First check for files directly in CSV_DIR (old structure)
    const directFiles = fs.readdirSync(CSV_DIR)
      .filter(file => file.toLowerCase().endsWith('.csv'));
    allFiles.push(...directFiles);
    
    // Then check flattened structure
    const shops = fs.readdirSync(CSV_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    shops.forEach(shopName => {
      const shopPath = path.join(CSV_DIR, shopName);
      const files = fs.readdirSync(shopPath)
        .filter(file => file.toLowerCase().endsWith('.csv'))
        .map(file => `${shopName}/${file}`);
      allFiles.push(...files);
    });
    
    res.json({ files: allFiles });
  } catch (error) {
    console.error('Error reading CSV directory:', error);
    res.status(500).json({ error: 'Failed to read CSV directory' });
  }
});

// Endpoint to get the data from a specific CSV file (updated for flattened structure)
app.get('/api/csv-data', (req, res) => {
  try {
    const { file, shop } = req.query;
    
    if (!file) {
      return res.status(400).json({ error: 'File parameter is required' });
    }
    
    let filePath;
    
    // If shop is provided, construct path from flattened hierarchy
    if (shop) {
      filePath = path.join(CSV_DIR, shop.toString(), file.toString());
    } else if (file.toString().includes('/')) {
      // If file includes path separators, use it directly (e.g., "ozon/file.csv")
      filePath = path.join(CSV_DIR, file.toString());
    } else {
      // Fallback: look for file directly in CSV_DIR (old structure)
      filePath = path.join(CSV_DIR, file.toString());
    }
    
    // Check if file exists and is within the CSV directory
    if (!fs.existsSync(filePath) || !filePath.startsWith(CSV_DIR)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    // Get headers from the first record
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    
    res.json({
      headers,
      data: records
    });
  } catch (error) {
    console.error('Error reading CSV file:', error);
    res.status(500).json({ error: 'Failed to read CSV file' });
  }
});

// Endpoint to get aggregated data from ALL CSV files for a given shop
app.get('/api/csv-data-global', (req, res) => {
  try {
    const { shop } = req.query;

    if (!shop) {
      return res.status(400).json({ error: 'Shop parameter is required' });
    }

    const shopPath = path.join(CSV_DIR, shop.toString());

    // Validate shop directory exists
    if (!fs.existsSync(shopPath) || !fs.statSync(shopPath).isDirectory()) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Gather all CSV files for this shop
    const csvFiles = fs.readdirSync(shopPath)
      .filter((file) => file.toLowerCase().endsWith('.csv'));

    // If no CSV files, return empty data
    if (csvFiles.length === 0) {
      return res.json({ headers: [], data: [] });
    }

    const headersSet = new Set();
    const aggregatedData = [];

    csvFiles.forEach((file) => {
      const filePath = path.join(shopPath, file);

      // Skip non-files just in case
      if (!fs.statSync(filePath).isFile()) return;

      const fileContent = fs.readFileSync(filePath, 'utf8');

      // Parse CSV content
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      // Determine megacategory name (file name without extension)
      const megaCategoryName = file.replace(/\.csv$/i, '');

      // Append megacategory field to each record and collect headers
      records.forEach((record) => {
        record.megacategory = megaCategoryName;
        aggregatedData.push(record);
      });

      // Collect headers from this file
      if (records.length > 0) {
        Object.keys(records[0]).forEach((h) => headersSet.add(h));
      }
    });

    // Ensure megacategory is included in headers
    headersSet.add('megacategory');

    const headers = Array.from(headersSet);

    res.json({ headers, data: aggregatedData });
  } catch (error) {
    console.error('Error aggregating CSV data:', error);
    res.status(500).json({ error: 'Failed to aggregate CSV data' });
  }
});

// Update (edit) a specific row in CSV file – supports locating row by index (legacy) or by URL (preferred)
app.put('/api/csv-data/row/:rowIndex', (req, res) => {
  try {
    const { file, shop, url: queryUrl } = req.query;
    const { rowIndex } = req.params;
    const { rowData } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'File parameter is required' });
    }
    
    if (!rowData) {
      return res.status(400).json({ error: 'Row data is required' });
    }
    
    let filePath;
    
    // If shop is provided, construct path from flattened hierarchy
    if (shop) {
      filePath = path.join(CSV_DIR, shop.toString(), file.toString());
    } else if (file.toString().includes('/')) {
      // If file includes path separators, use it directly (e.g., "ozon/file.csv")
      filePath = path.join(CSV_DIR, file.toString());
    } else {
      // Fallback: look for file directly in CSV_DIR (old structure)
      filePath = path.join(CSV_DIR, file.toString());
    }
    
    // Check if file exists and is within the CSV directory
    if (!fs.existsSync(filePath) || !filePath.startsWith(CSV_DIR)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    
    let index;
    if (rowIndex === 'by-url') {
      if (!queryUrl) {
        return res.status(400).json({ error: 'url query parameter required when using rowIndex=by-url' });
      }
      const urlHeader = headers.find(h => normalizeHeader(h) === 'url');
      index = records.findIndex(r => r[urlHeader] === queryUrl || r[urlHeader] === decodeURIComponent(queryUrl));
      if (index === -1) return res.status(404).json({ error: 'Row with specified URL not found' });
    } else {
      index = parseInt(rowIndex);
      if (isNaN(index) || index < 0 || index >= records.length) {
        return res.status(400).json({ error: 'Invalid row index' });
      }
    }
    
    // Update the row
    records[index] = { ...records[index], ...rowData };
    
    // Convert back to CSV
    let csvContent = headers.join(',') + '\n';
    
    records.forEach(record => {
      const row = headers.map(header => {
        const value = record[header] || '';
        // Escape commas and quotes in CSV values
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvContent += row.join(',') + '\n';
    });
    
    // Write back to file
    fs.writeFileSync(filePath, csvContent, 'utf8');
    
    console.log(`Updated row ${index} in file ${file}`);
    
    res.json({ 
      success: true, 
      message: 'Row updated successfully',
      updatedRow: records[index]
    });
  } catch (error) {
    console.error('Error updating CSV row:', error);
    res.status(500).json({ error: 'Failed to update CSV row' });
  }
});

// Delete a specific row from CSV file – supports by index or by URL
app.delete('/api/csv-data/row/:rowIndex', (req, res) => {
  try {
    const { file, shop, url: queryUrl } = req.query;
    const { rowIndex } = req.params;
    
    if (!file) {
      return res.status(400).json({ error: 'File parameter is required' });
    }
    
    let filePath;
    
    // If shop is provided, construct path from flattened hierarchy
    if (shop) {
      filePath = path.join(CSV_DIR, shop.toString(), file.toString());
    } else if (file.toString().includes('/')) {
      // If file includes path separators, use it directly (e.g., "ozon/file.csv")
      filePath = path.join(CSV_DIR, file.toString());
    } else {
      // Fallback: look for file directly in CSV_DIR (old structure)
      filePath = path.join(CSV_DIR, file.toString());
    }
    
    // Check if file exists and is within the CSV directory
    if (!fs.existsSync(filePath) || !filePath.startsWith(CSV_DIR)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    
    // Helper to normalise URLs for matching
    const canonicalUrl = (u) => {
      if (!u) return '';
      const noQuery = u.split('?')[0];
      return noQuery.replace(/\/$/, '');
    };

    let index;
    if (rowIndex === 'by-url') {
      if (!queryUrl) {
        return res.status(400).json({ error: 'url query parameter required when using rowIndex=by-url' });
      }
      const urlHeader = headers.find(h => normalizeHeader(h) === 'url');
      index = records.findIndex(r => canonicalUrl(r[urlHeader]) === canonicalUrl(queryUrl) || canonicalUrl(r[urlHeader]) === canonicalUrl(decodeURIComponent(queryUrl)));
      if (index === -1) return res.status(404).json({ error: 'Row with specified URL not found' });
    } else {
      index = parseInt(rowIndex);
      if (isNaN(index) || index < 0 || index >= records.length) {
        return res.status(400).json({ error: 'Invalid row index' });
      }
    }
    
    // Capture URL of row to be deleted (for logging)
    const urlHeaderForLog = headers.find(h => normalizeHeader(h) === 'url');
    const deletedUrlForLog = records[index] ? records[index][urlHeaderForLog] : 'unknown-url';

    // Remove the row
    const deletedRow = records.splice(index, 1)[0];
    
    // Convert back to CSV
    if (records.length === 0) {
      // If no records left, just keep headers
      const headers = Object.keys(deletedRow);
      fs.writeFileSync(filePath, headers.join(',') + '\n', 'utf8');
    } else {
      const headers = Object.keys(records[0]);
      let csvContent = headers.join(',') + '\n';
      
      records.forEach(record => {
        const row = headers.map(header => {
          const value = record[header] || '';
          // Escape commas and quotes in CSV values
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        csvContent += row.join(',') + '\n';
      });
      
      // Write back to file
      fs.writeFileSync(filePath, csvContent, 'utf8');
    }
    
    console.log(`Deleted row idx=${index} url=${deletedUrlForLog} from file ${file}`);
    
    res.json({ 
      success: true, 
      message: 'Row deleted successfully',
      deletedRow: deletedRow,
      remainingRows: records.length
    });
  } catch (error) {
    console.error('Error deleting CSV row:', error);
    res.status(500).json({ error: 'Failed to delete CSV row' });
  }
});

// Google Sheets endpoints

// OAuth2 authorization URL endpoint
app.get('/api/google-sheets/auth-url', async (req, res) => {
  try {
    const auth = await getGoogleSheetsAuth();
    
    if (auth.generateAuthUrl) {
      // OAuth2 flow
      const authUrl = auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
      });
      
      res.json({ authUrl });
    } else {
      res.json({ message: 'Service account authentication - no user auth required' });
    }
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth2 token exchange endpoint
app.post('/api/google-sheets/auth-token', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!oAuth2Client) {
      await getGoogleSheetsAuth();
    }
    
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    
    // Save token for future use
    const tokenPath = path.resolve('./token.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens));
    
    res.json({ success: true, message: 'Authentication successful' });
  } catch (error) {
    console.error('Error exchanging auth code:', error);
    res.status(500).json({ error: 'Failed to exchange authorization code' });
  }
});

// Set Google Sheets URL
app.post('/api/google-sheets/set-url', (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Invalid Google Sheets URL' });
    }
    
    googleSheetsUrl = url;
    console.log('Google Sheets URL set:', url);
    res.json({ success: true, message: 'Google Sheets URL set successfully' });
  } catch (error) {
    console.error('Error setting Google Sheets URL:', error);
    res.status(500).json({ error: 'Failed to set Google Sheets URL' });
  }
});

// Get current Google Sheets URL
app.get('/api/google-sheets/url', (req, res) => {
  res.json({ url: googleSheetsUrl });
});

// Get Google Sheets headers
app.get('/api/google-sheets/headers', async (req, res) => {
  try {
    if (!googleSheetsUrl) {
      return res.status(400).json({ error: 'Google Sheets URL not set' });
    }
    
    const spreadsheetId = extractSpreadsheetId(googleSheetsUrl);
    const auth = await getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Fetching headers from Google Sheets...');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '1:1', // First row only
    });
    
    const headers = response.data.values ? response.data.values[0] : [];
    console.log('Retrieved headers:', headers);
    
    res.json({ headers });
  } catch (error) {
    console.error('Error getting Google Sheets headers:', error);
    
    if (error.code === 401) {
      res.status(401).json({ 
        error: 'Authentication required. Please authenticate with Google first.',
        requiresAuth: true 
      });
    } else if (error.code === 403) {
      res.status(403).json({ 
        error: 'Access denied. Please make sure the sheet is shared properly.',
        details: error.message 
      });
    } else {
      res.status(500).json({ error: `Failed to get Google Sheets headers: ${error.message}` });
    }
  }
});

// Append row to Google Sheets
app.post('/api/google-sheets/append', async (req, res) => {
  try {
    if (!googleSheetsUrl) {
      return res.status(400).json({ error: 'Google Sheets URL not set' });
    }
    
    const { rowData, webAppHeaders, tabName } = req.body;
    const targetTabName = tabName || 'Продукты';
    
    if (!rowData || !webAppHeaders) {
      return res.status(400).json({ error: 'Row data and headers are required' });
    }
    
    const spreadsheetId = extractSpreadsheetId(googleSheetsUrl);
    const auth = await getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Appending row to Google Sheets...');
    console.log('Spreadsheet ID:', spreadsheetId);
    console.log('Target tab:', targetTabName);
    console.log('Web app headers:', webAppHeaders);
    console.log('Row data:', rowData);
    
    // Check if the specified tab exists, create it if it doesn't
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets.map(sheet => sheet.properties.title);
    
    if (!existingSheets.includes(targetTabName)) {
      console.log(`Tab "${targetTabName}" doesn't exist, creating it...`);
      
      // Create the new tab and capture its sheetId so we can freeze the header row
      const addSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: targetTabName,
                },
              },
            },
          ],
        },
      });
      
      // Extract the sheetId of the newly created tab (if available)
      const newSheetId = addSheetResponse?.data?.replies?.[0]?.addSheet?.properties?.sheetId;
      
      // Freeze the header row (first row) if we successfully obtained the sheetId
      if (newSheetId !== undefined) {
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId: newSheetId,
                      gridProperties: {
                        frozenRowCount: 1,
                      },
                    },
                    fields: 'gridProperties.frozenRowCount',
                  },
                },
              ],
            },
          });
          console.log(`Frozen first row in newly created tab "${targetTabName}" (sheetId: ${newSheetId})`);
        } catch (freezeError) {
          console.warn('Unable to freeze header row in newly created tab:', freezeError.message);
        }
      }
      
      // Add default headers to the new tab
      const defaultHeaders = [
        'url', 'name', 'pri/we', 'pro/cal', 'weight', 'price', 'calories', 
        'proteins', 'fats', 'carbohydrates', 'content', 'description', 
        'availability', 'category', 'average_rating', 'rating_count'
      ];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${targetTabName}!1:1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [defaultHeaders],
        },
      });
      
      console.log(`Tab "${targetTabName}" created with headers`);
    }
    
    // Get headers from the target tab
    const headersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${targetTabName}!1:1`,
    });
    
    const googleSheetsHeaders = headersResponse.data.values ? headersResponse.data.values[0] : [];
    console.log('Google Sheets headers:', googleSheetsHeaders);
    console.log('Web app headers:', webAppHeaders);
    
    // Normalize headers for debugging
    const normalizedGoogleHeaders = googleSheetsHeaders.map(normalizeHeader);
    const normalizedWebAppHeaders = webAppHeaders.map(normalizeHeader);
    console.log('Normalized Google Sheets headers:', normalizedGoogleHeaders);
    console.log('Normalized web app headers:', normalizedWebAppHeaders);
    
    // Map web app row data to Google Sheets column order
    const mappedRow = googleSheetsHeaders.map(header => {
      const normalizedGoogleHeader = normalizeHeader(header);
      
      // Find matching web app column by comparing normalized headers
      const webAppColumnIndex = webAppHeaders.findIndex(webAppHeader => 
        normalizeHeader(webAppHeader) === normalizedGoogleHeader
      );
      
      if (webAppColumnIndex !== -1) {
        return rowData[webAppColumnIndex] || '';
      }
      return ''; // Empty cell if column not found in web app data
    });
    
    // Add current date and time if those columns exist
    const dateIndex = googleSheetsHeaders.indexOf('date');
    const timeIndex = googleSheetsHeaders.indexOf('time');
    
    if (dateIndex !== -1) {
      mappedRow[dateIndex] = new Date().toLocaleDateString();
    }
    
    if (timeIndex !== -1) {
      mappedRow[timeIndex] = new Date().toLocaleTimeString();
    }
    
    console.log('Mapped row for Google Sheets:', mappedRow);
    
    // Determine the first non-empty header (to handle leading blank columns)
    const firstHeaderIndex = googleSheetsHeaders.findIndex(h => h && h.toString().trim() !== '');
    const startIndex = firstHeaderIndex === -1 ? 0 : firstHeaderIndex;

    // Helper to convert a zero-based column index to its A1 letter(s)
    const columnIdxToLetter = (idx) => {
      let letter = '';
      let num = idx + 1; // 1-based for calculation
      while (num > 0) {
        const rem = (num - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        num = Math.floor((num - 1) / 26);
      }
      return letter;
    };

    // Create the final row values trimmed of leading blanks so they align with the table start column
    const trimmedRow = mappedRow.slice(startIndex);

    // Build the range starting at the first non-empty header column (e.g. "B:B")
    const startColumnLetter = columnIdxToLetter(startIndex);

    const appendResponse = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${targetTabName}!${startColumnLetter}:${startColumnLetter}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [trimmedRow],
      },
    });
    
    console.log('Row appended successfully:', appendResponse.data.updates);
    
    res.json({ 
      success: true, 
      message: `Row appended successfully to "${targetTabName}" tab!`,
      updatedRows: appendResponse.data.updates.updatedRows,
      tabName: targetTabName
    });
  } catch (error) {
    console.error('Error appending to Google Sheets:', error);
    
    if (error.code === 401) {
      res.status(401).json({ 
        error: 'Authentication required. Please authenticate with Google first.',
        requiresAuth: true 
      });
    } else if (error.code === 403) {
      res.status(403).json({ 
        error: 'Access denied. Please make sure the sheet has edit permissions.',
        details: error.message 
      });
    } else {
      res.status(500).json({ error: `Failed to append to Google Sheets: ${error.message}` });
    }
  }
});

// Create new Google Sheet
app.post('/api/google-sheets/create', async (req, res) => {
  try {
    const { sheetTitle, tabName, headers, freezeRows } = req.body;
    
    if (!sheetTitle) {
      return res.status(400).json({ error: 'Sheet title is required' });
    }
    
    const auth = await getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Creating new Google Sheet...');
    console.log('Sheet title:', sheetTitle);
    console.log('Tab name:', tabName);
    console.log('Headers:', headers);
    
    // Create a new spreadsheet
    const createResponse = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: sheetTitle,
        },
        sheets: [
          {
            properties: {
              title: tabName || 'Продукты',
            },
          },
        ],
      },
    });
    
    const spreadsheetId = createResponse.data.spreadsheetId;
    const firstSheet = createResponse.data.sheets && createResponse.data.sheets[0];
    const sheetId = firstSheet ? firstSheet.properties.sheetId : null;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    
    console.log('Spreadsheet created:', spreadsheetUrl);
    
    // Make the spreadsheet publicly editable
    const drive = google.drive({ version: 'v3', auth });
    await drive.permissions.create({
      fileId: spreadsheetId,
      resource: {
        role: 'writer',
        type: 'anyone',
      },
    });
    
    console.log('Spreadsheet made publicly editable');
    
    // Add headers to the first row if provided
    if (headers && headers.length > 0) {
      const tabTitle = tabName || 'Продукты';
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabTitle}!1:1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [headers],
        },
      });
      console.log('Headers added to spreadsheet');
    }
    
    // Freeze rows if requested and sheetId is available
    if (freezeRows && sheetId !== null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: {
                    frozenRowCount: freezeRows,
                  },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
      console.log(`Frozen first ${freezeRows} row(s) in sheet`);
    }
    
    // Update the global URL for immediate use
    googleSheetsUrl = spreadsheetUrl;
    
    res.json({ 
      success: true, 
      message: 'Google Sheet created successfully!',
      spreadsheetId,
      spreadsheetUrl,
      tabName: tabName || 'Продукты'
    });
  } catch (error) {
    console.error('Error creating Google Sheet:', error);
    
    if (error.code === 401) {
      res.status(401).json({ 
        error: 'Authentication required. Please check your service account credentials.',
        requiresAuth: true 
      });
    } else if (error.code === 403) {
      res.status(403).json({ 
        error: 'Access denied. Please check your service account permissions.',
        details: error.message 
      });
    } else {
      res.status(500).json({ error: `Failed to create Google Sheet: ${error.message}` });
    }
  }
});

// Endpoint to refresh availability using a Python script and stream progress via SSE
app.post('/api/update-availability', (req, res) => {
  const { shop, file, urls } = req.body;
  const key = `${shop}-${file}`;
  
  // Cancel any existing process for this shop/file
  const existingProcess = activeProcesses.get(key);
  if (existingProcess) {
    try {
      existingProcess.kill('SIGKILL');
    } catch (e) {
      console.error('Error killing existing process:', e);
    }
    activeProcesses.delete(key);
  }

  try {
    if (!shop || !file) {
      return res.status(400).json({ error: 'shop and file are required' });
    }

    const csvPath = path.join(CSV_DIR, shop.toString(), file.toString());
    if (!fs.existsSync(csvPath) || !csvPath.startsWith(CSV_DIR)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }

    // Parse the CSV to get total rows and build a quick lookup by URL (handle BOM)
    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
    const headers = records.length > 0 ? Object.keys(records[0]) : [];

    const urlHeader = headers.find(h => normalizeHeader(h) === 'url');
    if (!urlHeader) {
      return res.status(400).json({ error: "CSV doesn't contain a 'url' column" });
    }

    // Build map for quick access (use canonical URL to avoid query differences)
    const canonicalUrl = (u) => {
      if (!u) return '';
      // Remove query string and trailing slash
      try {
        const noQuery = u.split('?')[0];
        return noQuery.replace(/\/$/, '');
      } catch {
        return u;
      }
    };

    const rowMap = new Map();
    records.forEach((row, idx) => {
      rowMap.set(canonicalUrl(row[urlHeader]), idx);
    });

    // If URLs are provided, validate them
    let urlsToUpdate;
    if (urls) {
      if (!Array.isArray(urls)) {
        return res.status(400).json({ error: 'urls must be an array' });
      }
      urlsToUpdate = urls;
    }

    const total = urlsToUpdate ? urlsToUpdate.length : records.length;

    // Prepare SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable proxy buffering
    });

    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'start', total })}\n\n`);

    // Create a temporary CSV with only the URLs we want to update
    const tmpFile = path.join(os.tmpdir(), `avail_${Date.now()}_${randomBytes(4).toString('hex')}.csv`);
    const urlsToProcess = urlsToUpdate || records.map(r => r[urlHeader]);
    fs.writeFileSync(tmpFile, `url\n${urlsToProcess.join('\n')}\n`, 'utf8');

    // Determine which Python script to use based on the shop (ozon / vkusvill)
    let scriptPath;
    let scriptArgs;
    const shopLc = shop.toString().toLowerCase();
    if (shopLc.includes('vkusvill') || shopLc.includes('вкусвилл')) {
      // VkusVill scraper
      scriptPath = path.join(VKUSVILL_DIR, 'vkusvill.py');
      scriptArgs = [scriptPath, '--check-availability', tmpFile];
    } else if (shopLc.includes('ozon') || shopLc.includes('озон')) {
      // Ozon scraper
      scriptPath = path.join(OZON_DIR, 'availability_check.py');
      scriptArgs = [scriptPath, tmpFile];
    } else {
      // Fallback to mock script if unknown shop
      scriptPath = path.resolve(__dirname, 'mock_availability.py');
      scriptArgs = [scriptPath, tmpFile];
    }

    const pythonCmd = detectPythonBinary();

    // Check if Python script exists
    if (!fs.existsSync(scriptPath)) {
      console.error('Python script not found:', scriptPath);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: `Python script not found at ${scriptPath}` 
      })}\n\n`);
      return res.end();
    }

    // Check Python version first
    const checkPython = spawn(pythonCmd, ['--version']);
    checkPython.on('error', (err) => {
      console.error(`Failed to start ${pythonCmd}:`, err);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: `Python not found or not executable. Please ensure ${pythonCmd} is installed and in PATH. Error: ${err.message}` 
      })}\n\n`);
      return res.end();
    });

    checkPython.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python version check failed with code ${code}`);
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          message: `Python version check failed. Please ensure ${pythonCmd} is installed correctly.` 
        })}\n\n`);
        return res.end();
      }

      // If Python check passed, proceed with the main script
      const py = spawn(pythonCmd, scriptArgs, { cwd: path.dirname(scriptPath) });
      activeProcesses.set(key, py);

      // Handle spawn errors (e.g., ENOENT for missing binary)
      py.on('error', (err) => {
        console.error(`Failed to start Python script:`, err);
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          message: `Failed to start Python script: ${err.message}` 
        })}\n\n`);
        return res.end();
      });

      // Capture stderr output
      let stderrOutput = '';
      py.stderr.on('data', (data) => {
        const output = data.toString();
        stderrOutput += output;
        console.error('Python stderr:', output); // Log to server console
      });

      const rl = readline.createInterface({ input: py.stdout });
      let processed = 0;

      rl.on('line', (line) => {
        const trimmed = line.trim();
        // We expect lines like: "<url> <availability>". Ignore anything else.
        const match = trimmed.match(/^(https?:\/\/\S+)\s+(\d+)$/);
        if (!match) {
          // Not a data line – skip (but keep stderr logging above)
          return;
        }
        const url = canonicalUrl(match[1]);
        const availability = parseInt(match[2], 10);

        const rowIdx = rowMap.get(url);
        if (rowIdx !== undefined) {
          records[rowIdx]['availability'] = availability;
          // Update timestamp in desired format YYYY-MM-DD HH:MM:SS
          records[rowIdx]['last_upd_time'] = new Date().toISOString().slice(0, 19).replace('T', ' ');
        }

        processed += 1;
        res.write(`data: ${JSON.stringify({ type: 'progress', processed, total })}\n\n`);

        // Log to server console
        console.log(`[availability] ${url} -> ${availability}`);
      });

      py.on('close', (code) => {
        activeProcesses.delete(key);
        // Clean up temp file
        fs.unlink(tmpFile, () => {});

        if (code !== 0) {
          const errorMessage = stderrOutput.trim() || 'Unknown error';
          console.error('Python script failed:', {
            code,
            stderr: stderrOutput,
            tmpFile,
            scriptPath
          });
          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: `Python script failed (code ${code}): ${errorMessage}` 
          })}\n\n`);
          return res.end();
        }

        // Serialize back to CSV (simple implementation)
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          if (str.includes(',') || str.includes('\n')) {
            return `"${str}"`;
          }
          return str;
        };

        const csvLines = [];
        csvLines.push(headers.join(','));
        records.forEach((row) => {
          const line = headers.map((h) => escapeCsv(row[h])).join(',');
          csvLines.push(line);
        });
        fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      });

      // Handle client disconnect
      req.on('close', () => {
        if (py) {
          try {
            // Try to kill the process group first (Unix-like systems)
            try {
              // Send SIGKILL immediately to the process group
              process.kill(-py.pid, 'SIGKILL');
            } catch (e) {
              // If process group kill fails, try to kill just the process
              try {
                py.kill('SIGKILL');
              } catch (killErr) {
                console.error('Failed to kill Python process:', killErr);
              }
            }
          } catch (e) {
            console.error('Error killing Python process:', e);
          }
        }
        // Clean up temp file
        if (tmpFile) {
          try {
            fs.unlinkSync(tmpFile);
          } catch (e) {
            console.error('Error removing temp file:', e);
          }
        }
      });

      // Handle process errors
      py.on('error', (err) => {
        console.error('Python process error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: `Python process error: ${err.message}` });
        }
      });

      // Handle process exit
      py.on('exit', (code, signal) => {
        activeProcesses.delete(key);
        console.log(`Python process exited with code ${code} and signal ${signal}`);
        // Don't treat SIGKILL as an error since it's our cancellation signal
        if (code !== 0 && signal !== 'SIGKILL' && !res.headersSent) {
          res.status(500).json({ error: 'Python script failed', code, stderr: py.stderr, tmpFile, scriptPath });
        }
      });

      // Handle process stdout
      py.stdout.on('data', (data) => {
        if (!res.headersSent) {
          res.write(`data: ${JSON.stringify({ type: 'progress', processed: data.toString().split('\n').length - 1 })}\n\n`);
        }
      });

      // Handle process stderr
      py.stderr.on('data', (data) => {
        console.error('Python stderr:', data.toString());
      });
    });
  } catch (err) {
    console.error('Error in update-availability endpoint:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Endpoint to refresh availability for a single row
app.post('/api/update-availability-row', async (req, res) => {
  try {
    const { shop, file, url } = req.body || {};
    if (!shop || !file || !url) {
      return res.status(400).json({ error: 'shop, file and url are required' });
    }

    const csvPath = path.join(CSV_DIR, shop.toString(), file.toString());
    if (!fs.existsSync(csvPath) || !csvPath.startsWith(CSV_DIR)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }

    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    const urlHeader = headers.find(h => normalizeHeader(h) === 'url');
    if (!urlHeader) {
      return res.status(400).json({ error: "CSV doesn't contain a 'url' column" });
    }

    const canonicalUrl = (u) => {
      if (!u) return '';
      const noQuery = u.split('?')[0];
      return noQuery.replace(/\/$/, '');
    };

    const rowIdx = records.findIndex(r => canonicalUrl(r[urlHeader]) === canonicalUrl(url));
    if (rowIdx === -1) {
      return res.status(404).json({ error: 'Row with specified URL not found' });
    }

    // Create temp CSV with url header and one row
    const tmpFile = path.join(os.tmpdir(), `avail_${Date.now()}_${randomBytes(4).toString('hex')}.csv`);
    fs.writeFileSync(tmpFile, `url\n${url}\n`, 'utf8');

    const pythonCmd = detectPythonBinary();

    // Select appropriate script based on shop
    let scriptPath;
    let scriptArgs;
    const shopLc = shop.toString().toLowerCase();
    if (shopLc.includes('vkusvill') || shopLc.includes('вкусвилл')) {
      scriptPath = path.join(VKUSVILL_DIR, 'vkusvill.py');
      scriptArgs = [scriptPath, '--check-availability', tmpFile, '--no-logging'];
    } else if (shopLc.includes('ozon') || shopLc.includes('озон')) {
      scriptPath = path.join(OZON_DIR, 'availability_check.py');
      scriptArgs = [scriptPath, tmpFile];
    } else {
      scriptPath = path.resolve(__dirname, 'mock_availability.py');
      scriptArgs = [scriptPath, tmpFile];
    }

    const outChunks = [];
    const py = spawn(pythonCmd, scriptArgs, { cwd: path.dirname(scriptPath) });

    py.stdout.on('data', (chunk) => outChunks.push(chunk));

    py.on('error', (err) => {
      console.error('Python error:', err);
      return res.status(500).json({ error: 'Failed to spawn python process', details: err.message });
    });

    // Print arguments
    console.log('Python arguments:', scriptArgs);

    py.on('close', () => {
      try {
        const output = Buffer.concat(outChunks).toString().trim();
        // Expect line like "<url> <availability>"
        const match = output.match(/^(https?:\/\/\S+)\s+(\d+)$/m);
        if (!match) throw new Error('Unexpected script output: ' + output);
        const availability = parseInt(match[2], 10);
        records[rowIdx]['availability'] = availability;
        records[rowIdx]['last_upd_time'] = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Log to server console
        console.log(`[availability-row] ${canonicalUrl(url)} -> ${availability}`);

        // Serialize back
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes('"')) return `"${str.replace(/"/g, '""')}"`;
          if (str.includes(',') || str.includes('\n')) return `"${str}"`;
          return str;
        };
        const csvLines = [headers.join(',')];
        records.forEach(r => {
          csvLines.push(headers.map(h => escapeCsv(r[h])).join(','));
        });
        fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');

        fs.unlink(tmpFile, () => {}); // cleanup

        res.json({ success: true, availability, last_upd_time: records[rowIdx]['last_upd_time'] });
      } catch (err) {
        console.error('Error processing availability row:', err);
        res.status(500).json({ error: err.message });
      }
    });
  } catch (err) {
    console.error('Error in update-availability-row:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add this with other route handlers
app.post('/api/update-availability/cancel', (req, res) => {
  const { shop, file } = req.body;
  const key = `${shop}-${file}`;
  
  const process = activeProcesses.get(key);
  if (process) {
    try {
      // Try to kill the process group first (Unix-like systems)
      try {
        process.kill(-process.pid, 'SIGKILL');
      } catch (e) {
        // If process group kill fails, try to kill just the process
        process.kill('SIGKILL');
      }
      activeProcesses.delete(key);
      res.json({ success: true, message: 'Process cancelled' });
    } catch (err) {
      console.error('Error cancelling process:', err);
      res.status(500).json({ error: 'Failed to cancel process' });
    }
  } else {
    res.json({ success: true, message: 'No active process found' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});