const axios = require('axios');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

/**
 * Get values from a sheet via Apps Script
 * @param {string} sheetName - Name of the sheet (Users, Conversations, Leads)
 */
async function getSheetValues(sheetName) {
  try {
    const response = await axios.get(APPS_SCRIPT_URL, {
      params: {
        action: 'getRows',
        sheet: sheetName
      }
    });

    if (response.data.success) {
      return response.data.data || [];
    }
    
    return [];
  } catch (error) {
    console.error(`[ERROR] Failed to read from ${sheetName}:`, error.message);
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
      return { success: false, error: 'No Apps Script URL configured' };
    }
    
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=appendRow&sheet=${sheetName}`,
      { values },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return response.data;
  } catch (error) {
    console.error(`[ERROR] Failed to append to ${sheetName}:`, error.message);
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
      return { success: false, error: 'No Apps Script URL configured' };
    }
    
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=updateRow&sheet=${sheetName}`,
      { row: rowIndex, values },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return response.data;
  } catch (error) {
    console.error(`[ERROR] Failed to update ${sheetName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize sheet headers if they don't exist
 */
async function initializeSheets() {
  try {
    if (!APPS_SCRIPT_URL) {
      console.log('[WARN] APPS_SCRIPT_URL not configured - Google Sheets disabled');
      return;
    }
    
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=initializeHeaders`,
      {},
      { headers: { 'Content-Type': 'application/json' }
    });
    
    // Also ensure Contacts sheet has the correct headers
    const contactsHeaders = ['Phone Number', 'Name', 'First Contact', 'Last Contact', 'Total Messages', 'Lead Status', 'Tags', 'Notes', 'Chat History'];
    await axios.post(
      `${APPS_SCRIPT_URL}?action=ensureHeaders&sheet=Contacts`,
      { headers: contactsHeaders },
      { headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to initialize sheets:', error.message);
  }
}

module.exports = {
  getSheetValues,
  appendSheetValues,
  updateSheetValues,
  initializeSheets
};