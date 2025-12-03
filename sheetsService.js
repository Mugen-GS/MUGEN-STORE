const axios = require('axios');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

/**
 * Get values from a sheet via Apps Script
 * @param {string} sheetName - Name of the sheet (Users, Conversations, Leads)
 */
async function getSheetValues(sheetName) {
  try {
    console.log(`🔍 Reading from sheet: ${sheetName}`);
    const response = await axios.get(APPS_SCRIPT_URL, {
      params: {
        action: 'getRows',
        sheet: sheetName
      }
    });

    if (response.data.success) {
      console.log(`✅ Successfully read ${response.data.data?.length || 0} rows from ${sheetName}`);
      return response.data.data || [];
    }
    
    console.error('❌ Error from Apps Script:', response.data.error);
    return [];
  } catch (error) {
    console.error('❌ Error reading from Google Sheets:', error.message);
    return [];
  }
}

/**
 * Append values to a sheet via Apps Script
 * @param {string} sheetName - Name of the sheet
 * @param {Array} values - Array of values to append
 */
async function appendSheetValues(sheetName, values) {
  try {
    if (!APPS_SCRIPT_URL) {
      console.error('❌ APPS_SCRIPT_URL is not set in environment variables!');
      return { success: false, error: 'No Apps Script URL configured' };
    }
    
    console.log(`📝 Saving to ${sheetName}:`, values);
    
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=appendRow&sheet=${sheetName}`,
      { values },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`✅ Saved to ${sheetName}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`❌ Error appending to ${sheetName}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update values in a sheet via Apps Script
 * @param {string} sheetName - Name of the sheet
 * @param {number} rowIndex - Row number to update (1-based)
 * @param {Array} values - Array of values to update
 */
async function updateSheetValues(sheetName, rowIndex, values) {
  try {
    if (!APPS_SCRIPT_URL) {
      console.error('❌ APPS_SCRIPT_URL is not set in environment variables!');
      return { success: false, error: 'No Apps Script URL configured' };
    }
    
    console.log(`📝 Updating ${sheetName} row ${rowIndex}:`, values);
    
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=updateRow&sheet=${sheetName}`,
      { row: rowIndex, values },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`✅ Updated ${sheetName}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`❌ Error updating ${sheetName}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize sheet headers if they don't exist
 */
async function initializeSheets() {
  try {
    if (!APPS_SCRIPT_URL) {
      console.error('❌ APPS_SCRIPT_URL is not set in environment variables!');
      console.log('ℹ️  Set APPS_SCRIPT_URL in Render dashboard to enable Google Sheets');
      return;
    }
    
    console.log('🔄 Initializing Google Sheets...');
    
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=initializeHeaders`,
      {},
      { headers: { 'Content-Type': 'application/json' }
    });
    
    // Also ensure Contacts sheet has the correct headers
    const contactsHeaders = ['Phone Number', 'Name', 'First Contact', 'Last Contact', 'Total Messages', 'Lead Status', 'Tags', 'Notes', 'Chat History'];
    const contactsResponse = await axios.post(
      `${APPS_SCRIPT_URL}?action=ensureHeaders&sheet=Contacts`,
      { headers: contactsHeaders },
      { headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.data.success) {
      console.log('📊 Google Sheets ready!');
    } else {
      console.error('❌ Failed to initialize sheets:', response.data);
    }
  } catch (error) {
    console.error('❌ Error initializing sheets:', error.response?.data || error.message);
    console.log('ℹ️  Check if Apps Script is deployed and APPS_SCRIPT_URL is correct');
  }
}

module.exports = {
  getSheetValues,
  appendSheetValues,
  updateSheetValues,
  initializeSheets
};
