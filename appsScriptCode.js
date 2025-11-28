// Google Apps Script Code - Deploy this as Web App
// This will act as your API endpoint for the Google Sheet

const SHEET_ID = 'YOUR_SHEET_ID_HERE'; // Your Google Sheet ID
const ss = SpreadsheetApp.openById(SHEET_ID);

// Handle GET requests (read data)
function doGet(e) {
  const action = e.parameter.action;
  const sheet = e.parameter.sheet;
  
  try {
    if (action === 'getRows') {
      return getRows(sheet);
    }
    
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Invalid action' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle POST requests (write data)
function doPost(e) {
  const action = e.parameter.action;
  const sheet = e.parameter.sheet;
  
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (action === 'appendRow') {
      return appendRow(sheet, data.values);
    } else if (action === 'updateRow') {
      return updateRow(sheet, data.row, data.values);
    } else if (action === 'initializeHeaders') {
      return initializeHeaders();
    }
    
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Invalid action' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Get all rows from a sheet
function getRows(sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Sheet not found' })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sheet.getDataRange().getValues();
  
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

// Append a row to a sheet
function appendRow(sheetName, values) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Sheet not found' })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  
  sheet.appendRow(values);
  
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: 'Row added' })
  ).setMimeType(ContentService.MimeType.JSON);
}

// Update a specific row
function updateRow(sheetName, rowIndex, values) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Sheet not found' })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  
  const range = sheet.getRange(rowIndex, 1, 1, values.length);
  range.setValues([values]);
  
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: 'Row updated' })
  ).setMimeType(ContentService.MimeType.JSON);
}

// Initialize sheet headers
function initializeHeaders() {
  // Users sheet
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Phone Number', 'Name', 'First Contact', 'Last Contact', 'Message Count', 'Lead Status', 'Notes']);
  }
  
  // Conversations sheet
  sheet = ss.getSheetByName('Conversations');
  if (!sheet) {
    sheet = ss.insertSheet('Conversations');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Phone Number', 'Timestamp', 'User Message', 'AI Response']);
  }
  
  // Leads sheet
  sheet = ss.getSheetByName('Leads');
  if (!sheet) {
    sheet = ss.insertSheet('Leads');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Phone Number', 'Name', 'Timestamp', 'Status', 'Score', 'Interests', 'Budget', 'Notes']);
  }
  
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: 'Headers initialized' })
  ).setMimeType(ContentService.MimeType.JSON);
}
