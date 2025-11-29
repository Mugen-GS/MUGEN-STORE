// Google Apps Script Code - Deploy this as Web App
// This will act as your API endpoint for the Google Sheet

const SHEET_ID = '1FRpTj9c1a6L7z-xNzB3ClpnhPiYQuCZ1A1pmhItP_Jo';

// Helper function to get spreadsheet (called within each function)
function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

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
  const ss = getSpreadsheet();
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
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Mugen Store Chats');
  if (!sheet) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Sheet not found' })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Add separator line before new contact if this is a user message from different contact
  const lastRow = sheet.getLastRow();
  if (lastRow > 1 && values[3] === 'User') { // Check if it's a user message
    const lastPhone = sheet.getRange(lastRow, 3).getValue();
    if (lastPhone !== values[2]) { // Different contact
      // Add empty row for visual separation
      sheet.appendRow(['', '', '', '', '', '', '']);
      sheet.getRange(sheet.getLastRow(), 1, 1, 7).setBackground('#f0f0f0');
    }
  }
  
  sheet.appendRow(values);
  
  // Format the row
  const newRow = sheet.getLastRow();
  if (values[3] === 'User') {
    sheet.getRange(newRow, 1, 1, 7).setBackground('#e8f0fe'); // Light blue for user
  } else if (values[3] === 'AI') {
    sheet.getRange(newRow, 1, 1, 7).setBackground('#e6f4ea'); // Light green for AI
  } else if (values[3] === 'Lead Alert') {
    sheet.getRange(newRow, 1, 1, 7).setBackground('#fce8e6').setFontWeight('bold'); // Light red for leads
  }
  
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: 'Row added' })
  ).setMimeType(ContentService.MimeType.JSON);
}

// Update a specific row
function updateRow(sheetName, rowIndex, values) {
  const ss = getSpreadsheet();
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
  const ss = getSpreadsheet();
  
  // Main chat sheet
  let sheet = ss.getSheetByName('Mugen Store Chats');
  if (!sheet) {
    sheet = ss.insertSheet('Mugen Store Chats');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Contact Name', 'Phone Number', 'Message Type', 'Message', 'Lead Status', 'Lead Score']);
    // Make header bold and frozen
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: 'Headers initialized' })
  ).setMimeType(ContentService.MimeType.JSON);
}
