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
    
    console.error('Error from Apps Script:', response.data.error);
    return [];
  } catch (error) {
    console.error('Error reading from Google Sheets:', error.message);
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
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=appendRow&sheet=${sheetName}`,
      { values },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return response.data;
  } catch (error) {
    console.error('Error appending to Google Sheets:', error.message);
    throw error;
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
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=updateRow&sheet=${sheetName}`,
      { row: rowIndex, values },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return response.data;
  } catch (error) {
    console.error('Error updating Google Sheets:', error.message);
    throw error;
  }
}

/**
 * Initialize sheet headers if they don't exist
 */
async function initializeSheets() {
  try {
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=initializeHeaders`,
      {},
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data.success) {
      console.log('📊 Google Sheets ready!');
    }
  } catch (error) {
    console.error('Error initializing sheets:', error.message);
  }
}

module.exports = {
  getSheetValues,
  appendSheetValues,
  updateSheetValues,
  initializeSheets
};
