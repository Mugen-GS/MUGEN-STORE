const { getSheetValues, appendSheetValues, updateSheetValues } = require('./sheetsService');

// Contact management (replaces User management)
const getContact = async (phoneNumber) => {
  try {
    console.log(`👤 Getting contact: ${phoneNumber}`);
    const rows = await getSheetValues('Contacts');
    console.log(`📋 All contact rows:`, rows.length);
    if (rows.length > 0) {
      console.log(`📋 Header row:`, rows[0]);
      console.log(`📋 First data row:`, rows[1]);
      console.log(`📋 Looking for phone: ${phoneNumber}`);
    }
    const contactRow = rows.slice(1).find(row => {
      // Handle type differences - convert both to strings for comparison
      const storedPhone = String(row[0]);
      const searchPhone = String(phoneNumber);
      const match = storedPhone === searchPhone;
      console.log(`  🔍 Comparing: '${storedPhone}' === '${searchPhone}' ? ${match}`);
      return match;
    }); // Skip header row
    
    if (!contactRow) {
      console.log(`❓ Contact not found: ${phoneNumber}`);
      return null;
    }
    
    console.log(`✅ Found contact: ${phoneNumber}`);
    return {
      phoneNumber: contactRow[0],
      name: contactRow[1],
      firstContactDate: contactRow[2],
      lastContactDate: contactRow[3],
      totalMessages: parseInt(contactRow[4]) || 0,
      leadStatus: contactRow[5],
      tags: contactRow[6] || '',
      notes: contactRow[7] || ''
    };
  } catch (error) {
    console.error('Error getting contact:', error.message);
    return null;
  }
};

const createOrUpdateContact = async (phoneNumber, name = null) => {
  try {
    console.log(`👤 Creating/updating contact: ${phoneNumber} (${name})`);
    const rows = await getSheetValues('Contacts');
    console.log(`📋 All contact rows:`, rows.length);
    if (rows.length > 0) {
      console.log(`📋 Header row:`, rows[0]);
      console.log(`📋 First data row:`, rows[1]);
      console.log(`📋 Looking for phone: ${phoneNumber}`);
    }
    const contacts = rows.slice(1); // Skip header
    const contactIndex = contacts.findIndex(row => {
      // Handle type differences - convert both to strings for comparison
      const storedPhone = String(row[0]);
      const searchPhone = String(phoneNumber);
      const match = storedPhone === searchPhone;
      console.log(`  🔍 Comparing: '${storedPhone}' === '${searchPhone}' ? ${match}`);
      return match;
    });
    
    const currentTime = new Date().toISOString();
    
    if (contactIndex !== -1) {
      // Update existing contact
      console.log(`🔄 Updating existing contact: ${phoneNumber}`);
      const existingContact = contacts[contactIndex];
      const updatedRow = [
        phoneNumber,
        name || existingContact[1],
        existingContact[2], // Keep first contact date
        currentTime, // Update last contact date
        (parseInt(existingContact[4]) || 0) + 1, // Increment total messages
        existingContact[5], // Keep lead status
        existingContact[6] || '', // Keep tags
        existingContact[7] || '' // Keep notes
      ];
      
      await updateSheetValues('Contacts', contactIndex + 2, updatedRow); // +2 because: 1 for header, 1 for 1-based index
      
      return {
        phoneNumber: updatedRow[0],
        name: updatedRow[1],
        firstContactDate: updatedRow[2],
        lastContactDate: updatedRow[3],
        totalMessages: updatedRow[4],
        leadStatus: updatedRow[5],
        tags: updatedRow[6],
        notes: updatedRow[7]
      };
    } else {
      // Create new contact
      console.log(`🆕 Creating new contact: ${phoneNumber}`);
      const newRow = [
        phoneNumber,
        name || 'Unknown',
        currentTime, // First contact date
        currentTime, // Last contact date
        1, // Total messages starts at 1
        'browsing', // Default lead status
        '', // No tags initially
        '' // No notes initially
      ];
      
      await appendSheetValues('Contacts', newRow);
      
      return {
        phoneNumber: newRow[0],
        name: newRow[1],
        firstContactDate: newRow[2],
        lastContactDate: newRow[3],
        totalMessages: newRow[4],
        leadStatus: newRow[5],
        tags: newRow[6],
        notes: newRow[7]
      };
    }
  } catch (error) {
    console.error('Error creating/updating contact:', error.message);
    return null;
  }
};

// Message management (replaces Conversation management)
const saveMessage = async (messageData) => {
  try {
    console.log(`💾 Saving message for ${messageData.phoneNumber}`);
    
    // Generate a unique MessageID
    const messageId = `${messageData.phoneNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const row = [
      messageId,
      messageData.phoneNumber,
      new Date().toISOString(),
      messageData.role, // 'user' or 'assistant'
      messageData.message,
      messageData.sessionId || 'default-session',
      messageData.messageType || 'other', // 'greeting', 'question', 'request', 'response', 'closing', 'other'
      messageData.sentiment || 'neutral', // 'positive', 'neutral', 'negative'
      messageData.intent || 'other' // 'pricing', 'support', 'browsing', 'purchase', 'other'
    ];
    
    await appendSheetValues('Messages', row);
    
    return messageId;
  } catch (error) {
    console.error('Error saving message:', error.message);
    return null;
  }
};

const getContactMessageHistory = async (phoneNumber, limit = 10) => {
  try {
    console.log(`🔍 Loading message history for: ${phoneNumber}`);
    const rows = await getSheetValues('Messages');
    const messages = rows.slice(1); // Skip header
    
    console.log(`📊 Total messages in sheet: ${messages.length}`);
    
    const contactMessages = messages
      .filter(row => {
        // Handle type differences - convert both to strings for comparison
        const storedPhone = String(row[1]); // Phone number is in column 2 (index 1)
        const searchPhone = String(phoneNumber);
        const match = storedPhone === searchPhone;
        console.log(`  🔍 Filtering message: '${storedPhone}' === '${searchPhone}' ? ${match}`);
        return match;
      })
      .map(row => ({
        messageId: row[0],
        phoneNumber: row[1],
        timestamp: row[2],
        role: row[3],
        message: row[4],
        sessionId: row[5],
        messageType: row[6],
        sentiment: row[7],
        intent: row[8]
      }));
    
    console.log(`📚 Found ${contactMessages.length} previous messages for ${phoneNumber}`);
    if (contactMessages.length > 0) {
      console.log('📝 Sample messages:');
      contactMessages.slice(0, 2).forEach((msg, idx) => {
        console.log(`  ${idx+1}. ${msg.role}: ${msg.message.substring(0, 50)}...`);
      });
    }
    return contactMessages.slice(-limit);
  } catch (error) {
    console.error('Error getting contact message history:', error.message);
    return [];
  }
};

// Lead management (simplified since it's now part of Contacts)
const updateContactLeadStatus = async (phoneNumber, status) => {
  try {
    const rows = await getSheetValues('Contacts');
    const contacts = rows.slice(1); // Skip header
    const contactIndex = contacts.findIndex(row => {
      // Handle type differences - convert both to strings for comparison
      const storedPhone = String(row[0]);
      const searchPhone = String(phoneNumber);
      const match = storedPhone === searchPhone;
      return match;
    });
    
    if (contactIndex !== -1) {
      const existingContact = [...contacts[contactIndex]]; // Create a copy
      existingContact[5] = status; // Update lead status column (index 5)
      
      await updateSheetValues('Contacts', contactIndex + 2, existingContact);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating contact lead status:', error.message);
    return false;
  }
};

// Session management for grouping messages
const generateSessionId = (phoneNumber) => {
  // Create session ID based on phone number and current date
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${phoneNumber}-${today}`;
};

module.exports = {
  getContact,
  createOrUpdateContact,
  saveMessage,
  getContactMessageHistory,
  updateContactLeadStatus,
  generateSessionId
};