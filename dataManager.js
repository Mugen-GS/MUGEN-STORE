const { getSheetValues, appendSheetValues, updateSheetValues } = require('./sheetsService');

const SHEET_NAME = 'Mugen Store Chats';

// User management
const getUser = async (phoneNumber) => {
  // Not needed for single sheet approach
  return null;
};

const createOrUpdateUser = async (phoneNumber, name = null) => {
  // User info is tracked in each message row
  return {
    phoneNumber,
    name: name || 'Unknown'
  };
};

// Conversation management
const saveConversation = async (phoneNumber, userName, userMessage, aiResponse) => {
  const timestamp = new Date().toISOString();
  
  // Save user message
  const userRow = [
    timestamp,
    userName,
    phoneNumber,
    'User',
    userMessage,
    '',
    ''
  ];
  await appendSheetValues(SHEET_NAME, userRow);
  
  // Save AI response
  const aiRow = [
    timestamp,
    userName,
    phoneNumber,
    'AI',
    aiResponse,
    '',
    ''
  ];
  await appendSheetValues(SHEET_NAME, aiRow);
};

const getUserConversationHistory = async (phoneNumber, limit = 10) => {
  const rows = await getSheetValues(SHEET_NAME);
  const conversations = rows.slice(1); // Skip header
  
  const userConversations = conversations
    .filter(row => row[2] === phoneNumber && (row[3] === 'User' || row[3] === 'AI'))
    .map(row => ({
      phoneNumber: row[2],
      timestamp: row[0],
      userMessage: row[3] === 'User' ? row[4] : '',
      aiResponse: row[3] === 'AI' ? row[4] : ''
    }))
    .filter(conv => conv.userMessage || conv.aiResponse);
  
  // Group user/AI pairs
  const paired = [];
  for (let i = 0; i < userConversations.length; i += 2) {
    if (userConversations[i] && userConversations[i + 1]) {
      paired.push({
        phoneNumber,
        timestamp: userConversations[i].timestamp,
        userMessage: userConversations[i].userMessage,
        aiResponse: userConversations[i + 1].aiResponse
      });
    }
  }
  
  return paired.slice(-limit);
};

// Lead management
const saveLead = async (phoneNumber, name, leadData = {}) => {
  const timestamp = new Date().toISOString();
  
  const leadRow = [
    timestamp,
    name,
    phoneNumber,
    'Lead Alert',
    `🔥 LEAD DETECTED - Status: ${leadData.status || 'interested'} | ${leadData.notes || ''}`,
    leadData.status || 'interested',
    leadData.score || 50
  ];
  
  await appendSheetValues(SHEET_NAME, leadRow);
  
  return {
    phoneNumber,
    name,
    timestamp,
    status: leadData.status,
    score: leadData.score,
    notes: leadData.notes
  };
};

const updateLeadStatus = async (phoneNumber, status) => {
  // Not needed for append-only sheet
  return true;
};

module.exports = {
  getUser,
  createOrUpdateUser,
  saveConversation,
  getUserConversationHistory,
  saveLead,
  updateLeadStatus
};
