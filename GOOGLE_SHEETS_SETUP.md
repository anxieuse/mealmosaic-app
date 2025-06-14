# Google Sheets Integration Setup

This feature allows you to append rows from your CSV data table to a Google Sheet.

## Service Account Setup

### Step 1: Create Service Account Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Sheets API:
   - Go to **APIs & Services** > **Library**
   - Search for "Google Sheets API"
   - Click **Enable**

4. Create Service Account:
   - Go to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **Service Account**
   - Enter a name (e.g., "sheets-integration")
   - Click **Create and Continue**
   - Role assignment: admin, owner, author > **Continue**
   - Click **Done**

5. Create and Download Key:
   - Click on your newly created service account
   - Go to **Keys** tab
   - Click **Add Key** > **Create New Key**
   - Choose **JSON** format
   - Download the file and save it as `credentials.json` in your project root

### Step 2: Set Environment Variable

```bash
export GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/your/credentials.json
```

### Step 3: Share Your Google Sheet

1. Open your Google Sheet
2. Click **Share** button  
3. Change from "Restricted" to **"Anyone with the link"** and set permission to **"Editor"**
4. Click **Copy link** and use this URL in the app

**Note:** You don't need to specifically share with the service account email - just make the sheet publicly editable with the link.

### Step 4: Test It!

1. Restart your server: `npm run dev`
2. Paste your Google Sheets URL in the app
3. Click **Save**
4. Try the row actions - they should work immediately!

## How to Use

### Row Actions Menu
Click the ⋮ button on any row to access:

**Append to Google Sheet**: Export row to your Google Sheet

### Features
- **Smart Column Mapping**: Automatically matches columns by name
- **All Data Included**: Exports all columns (including hidden ones)
- **Real-time Updates**: Changes are saved to CSV files immediately
- **Auto-refresh**: Table updates automatically after edits/deletes

## Expected Google Sheets Format

Your Google Sheet should have headers in the first row, e.g.:
```txt
name,price,quantity,total,date,time,status,any,other,columns
```

The system automatically:
- Maps columns by name (not position)
- Includes all row data (visible and hidden columns)
- Handles missing columns gracefully

## Troubleshooting

### "Access denied" Error
- Make sure the sheet is shared with "Anyone with the link can edit" permissions

### "Invalid Google Sheets URL" Error
- Make sure the URL is from Google Sheets
- Example: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`

### "Authentication required" Error
- Check that your `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` environment variable is set correctly
- Verify the credentials.json file exists and is valid