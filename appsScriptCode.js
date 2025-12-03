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

// Initialize sheet headers according to CRM optimization checklist
function initializeHeaders() {
  const ss = getSpreadsheet();
  
  // Contacts sheet - one row per phone number
  let sheet = ss.getSheetByName('Contacts');
  if (!sheet) {
    sheet = ss.insertSheet('Contacts');
  }
  if (sheet.getLastRow() === 0) {
    // Add headers with dropdown fields for consistent data entry
    sheet.appendRow(['Phone Number', 'Name', 'First Contact', 'Last Contact', 'Total Messages', 'Lead Status', 'Tags', 'Notes']);
    
    // Add dropdown for Lead Status
    const leadStatusCell = sheet.getRange(1, 6); // Column F (6)
    const leadStatusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['browsing', 'hot lead', 'cold lead', 'customer', 'unqualified'])
      .build();
    leadStatusCell.setDataValidation(leadStatusRule);
    
    // Add dropdown for Notes categories
    const notesCategoriesCell = sheet.getRange(1, 8); // Column H (8)
    const notesCategoriesRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['follow-up needed', 'interested', 'not interested', 'pricing inquiry', 'technical question', 'general inquiry'])
      .build();
    notesCategoriesCell.setDataValidation(notesCategoriesRule);
  }
  
  // Messages sheet - all chat logs with structured format
  sheet = ss.getSheetByName('Messages');
  if (!sheet) {
    sheet = ss.insertSheet('Messages');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['MessageID', 'Phone Number', 'Timestamp', 'Role', 'Message', 'SessionID', 'MessageType', 'Sentiment', 'Intent']);
    
    // Add dropdown for Role
    const roleCell = sheet.getRange(1, 4); // Column D (4)
    const roleRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['user', 'assistant'])
      .build();
    roleCell.setDataValidation(roleRule);
    
    // Add dropdown for MessageType
    const messageTypeCell = sheet.getRange(1, 7); // Column G (7)
    const messageTypeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['greeting', 'question', 'request', 'response', 'closing', 'other'])
      .build();
    messageTypeCell.setDataValidation(messageTypeRule);
    
    // Add dropdown for Sentiment
    const sentimentCell = sheet.getRange(1, 8); // Column H (8)
    const sentimentRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['positive', 'neutral', 'negative'])
      .build();
    sentimentCell.setDataValidation(sentimentRule);
    
    // Add dropdown for Intent
    const intentCell = sheet.getRange(1, 9); // Column I (9)
    const intentRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['pricing', 'support', 'browsing', 'purchase', 'other'])
      .build();
    intentCell.setDataValidation(intentRule);
  }
  
  // AI Memory sheet - business information and guidelines
  sheet = ss.getSheetByName('AI Memory');
  if (!sheet) {
    sheet = ss.insertSheet('AI Memory');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Category', 'Key', 'Value', 'Notes', 'Timestamp']);
  }
  
  // AI Guidelines sheet - instructions on how the AI should chat and interact
  sheet = ss.getSheetByName('AI Guidelines');
  if (!sheet) {
    sheet = ss.insertSheet('AI Guidelines');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Guideline Category', 'Title', 'Description', 'Priority', 'Active']);
    
    // Add sample guidelines
    sheet.appendRow(['Communication Style', 'Be Friendly', 'Always maintain a friendly and approachable tone', 'High', 'Yes']);
    sheet.appendRow(['Response Length', 'Keep it Short', 'Responses should be concise, ideally 1-2 sentences', 'High', 'Yes']);
    sheet.appendRow(['Product Knowledge', 'Use Available Info', 'Only provide information that exists in the AI Memory', 'High', 'Yes']);
  }
  
  // Dashboard Summary sheet - for charts and summaries
  sheet = ss.getSheetByName('Dashboard');
  if (!sheet) {
    sheet = ss.insertSheet('Dashboard');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Metric', 'Value', 'Last Updated']);
    sheet.appendRow(['Total Customers', 0, new Date()]);
    sheet.appendRow(['Total Messages', 0, new Date()]);
    sheet.appendRow(['Hot Leads', 0, new Date()]);
  }
  
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: 'Headers initialized with CRM optimization' })
  ).setMimeType(ContentService.MimeType.JSON);
}