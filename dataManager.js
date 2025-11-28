const { getSheetValues, appendSheetValues, updateSheetValues } = require('./sheetsService');

// User management
const getUser = async (phoneNumber) => {
  const rows = await getSheetValues('Users');
  const userRow = rows.slice(1).find(row => row[0] === phoneNumber); // Skip header row
  
  if (!userRow) return null;
  
  return {
    phoneNumber: userRow[0],
    name: userRow[1],
    firstContactDate: userRow[2],
    lastContactDate: userRow[3],
    messageCount: parseInt(userRow[4]) || 0,
    leadStatus: userRow[5],
    notes: userRow[6] || ''
  };
};

const createOrUpdateUser = async (phoneNumber, name = null) => {
  const rows = await getSheetValues('Users');
  const users = rows.slice(1); // Skip header
  const userIndex = users.findIndex(row => row[0] === phoneNumber);
  
  if (userIndex !== -1) {
    // Update existing user
    const existingUser = users[userIndex];
    const updatedRow = [
      phoneNumber,
      name || existingUser[1],
      existingUser[2], // Keep first contact date
      new Date().toISOString(),
      (parseInt(existingUser[4]) || 0) + 1,
      existingUser[5],
      existingUser[6] || ''
    ];
    
    await updateSheetValues('Users', userIndex + 2, updatedRow); // +2 because: 1 for header, 1 for 1-based index
    
    return {
      phoneNumber: updatedRow[0],
      name: updatedRow[1],
      firstContactDate: updatedRow[2],
      lastContactDate: updatedRow[3],
      messageCount: updatedRow[4],
      leadStatus: updatedRow[5],
      notes: updatedRow[6]
    };
  } else {
    // Create new user
    const newRow = [
      phoneNumber,
      name || 'Unknown',
      new Date().toISOString(),
      new Date().toISOString(),
      1,
      'browsing',
      ''
    ];
    
    await appendSheetValues('Users', newRow);
    
    return {
      phoneNumber: newRow[0],
      name: newRow[1],
      firstContactDate: newRow[2],
      lastContactDate: newRow[3],
      messageCount: newRow[4],
      leadStatus: newRow[5],
      notes: newRow[6]
    };
  }
};

// Conversation management
const saveConversation = async (phoneNumber, userMessage, aiResponse) => {
  const row = [
    phoneNumber,
    new Date().toISOString(),
    userMessage,
    aiResponse
  ];
  
  await appendSheetValues('Conversations', row);
};

const getUserConversationHistory = async (phoneNumber, limit = 10) => {
  const rows = await getSheetValues('Conversations');
  const conversations = rows.slice(1); // Skip header
  
  const userConversations = conversations
    .filter(row => row[0] === phoneNumber)
    .map(row => ({
      phoneNumber: row[0],
      timestamp: row[1],
      userMessage: row[2],
      aiResponse: row[3]
    }));
  
  return userConversations.slice(-limit);
};

// Lead management
const saveLead = async (phoneNumber, name, leadData = {}) => {
  const rows = await getSheetValues('Leads');
  const leads = rows.slice(1); // Skip header
  const leadIndex = leads.findIndex(row => row[0] === phoneNumber);
  
  const leadRow = [
    phoneNumber,
    name,
    new Date().toISOString(),
    leadData.status || 'interested',
    leadData.score || 50,
    Array.isArray(leadData.interests) ? leadData.interests.join(', ') : '',
    leadData.budget || '',
    leadData.notes || ''
  ];
  
  if (leadIndex !== -1) {
    // Update existing lead
    await updateSheetValues('Leads', leadIndex + 2, leadRow); // +2 for header and 1-based index
  } else {
    // Add new lead
    await appendSheetValues('Leads', leadRow);
  }
  
  return {
    phoneNumber: leadRow[0],
    name: leadRow[1],
    timestamp: leadRow[2],
    status: leadRow[3],
    score: leadRow[4],
    interests: leadRow[5],
    budget: leadRow[6],
    notes: leadRow[7]
  };
};

const updateLeadStatus = async (phoneNumber, status) => {
  const rows = await getSheetValues('Leads');
  const leads = rows.slice(1); // Skip header
  const leadIndex = leads.findIndex(row => row[0] === phoneNumber);
  
  if (leadIndex !== -1) {
    const existingLead = leads[leadIndex];
    existingLead[3] = status; // Update status column
    
    await updateSheetValues('Leads', leadIndex + 2, existingLead);
    return true;
  }
  return false;
};

module.exports = {
  getUser,
  createOrUpdateUser,
  saveConversation,
  getUserConversationHistory,
  saveLead,
  updateLeadStatus
};
