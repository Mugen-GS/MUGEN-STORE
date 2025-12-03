const { getSheetValues, appendSheetValues, updateSheetValues } = require('./sheetsService');

// Contact management (replaces User management)
const getContact = async (phoneNumber) => {
  try {
    // Normalize phone number for consistent comparison
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`👤 Getting contact: ${normalizedPhone}`);
    
    const rows = await getSheetValues('Contacts');
    console.log(`🔍 Reading from sheet: Contacts`);
    console.log(`📋 All contact rows:`, rows.length);
    
    if (rows.length > 0) {
      console.log(`📋 Header row:`, rows[0]);
      if (rows.length > 1) {
        console.log(`📋 First data row:`, rows[1]);
      }
      console.log(`📋 Looking for phone: ${normalizedPhone}`);
    }
    
    const contactRow = rows.slice(1).find(row => {
      if (!row || row.length === 0) return false;
      // Normalize both phone numbers for comparison
      const storedPhone = normalizePhoneNumber(String(row[0] || ''));
      const searchPhone = normalizePhoneNumber(normalizedPhone);
      const match = storedPhone === searchPhone;
      console.log(`  🔍 Comparing: '${storedPhone}' === '${searchPhone}' ? ${match}`);
      return match;
    }); // Skip header row
    
    if (!contactRow) {
      console.log(`❓ Contact not found: ${normalizedPhone}`);
      return null;
    }
    
    console.log(`✅ Found contact: ${normalizedPhone}`);
    return {
      phoneNumber: contactRow[0],
      name: contactRow[1],
      firstContactDate: contactRow[2],
      lastContactDate: contactRow[3],
      messageCount: parseInt(contactRow[4]) || 0,
      leadStatus: contactRow[5],
      tags: contactRow[6] || '',
      notes: contactRow[7] || '',
      chatHistory: contactRow[8] || '' // Chat history is now in column 9 (index 8), default to empty string if not present
    };
  } catch (error) {
    console.error('Error getting contact:', error.message);
    return null;
  }
};

const createOrUpdateContact = async (phoneNumber, name = null) => {
  try {
    // Normalize phone number for consistent storage
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`👤 Creating/updating contact: ${normalizedPhone} (${name})`);
    
    const rows = await getSheetValues('Contacts');
    console.log(`🔍 Reading from sheet: Contacts`);
    console.log(`📋 All contact rows:`, rows.length);
    
    if (rows.length > 0) {
      console.log(`📋 Header row:`, rows[0]);
      if (rows.length > 1) {
        console.log(`📋 First data row:`, rows[1]);
      }
      console.log(`📋 Looking for phone: ${normalizedPhone}`);
    }
    
    const contacts = rows.slice(1); // Skip header
    const contactIndex = contacts.findIndex(row => {
      if (!row || row.length === 0) return false;
      // Normalize both phone numbers for comparison
      const storedPhone = normalizePhoneNumber(String(row[0] || ''));
      const searchPhone = normalizePhoneNumber(normalizedPhone);
      const match = storedPhone === searchPhone;
      console.log(`  🔍 Comparing: '${storedPhone}' === '${searchPhone}' ? ${match}`);
      return match;
    });
    
    const timestamp = new Date().toISOString();
    
    if (contactIndex !== -1) {
      // Update existing contact
      console.log(`🔄 Updating existing contact: ${normalizedPhone}`);
      const existingContact = contacts[contactIndex];
      
      // Preserve chat history if it exists, otherwise use empty string
      const chatHistory = existingContact[8] || '';
      
      const updatedRow = [
        normalizedPhone, // Use normalized phone number
        name || existingContact[1],
        existingContact[2], // Keep first contact date
        timestamp, // Update last contact date
        (parseInt(existingContact[4]) || 0) + 1, // Increment message count
        existingContact[5], // Preserve lead status
        existingContact[6] || '', // Preserve tags
        existingContact[7] || '', // Preserve notes
        chatHistory // Preserve chat history (column 9)
      ];
      
      // Ensure the row has exactly 9 elements (in case the sheet was created before we added chat history)
      while (updatedRow.length < 9) {
        updatedRow.push('');
      }
      
      await updateSheetValues('Contacts', contactIndex + 2, updatedRow); // +2 because: 1 for header, 1 for 1-based index
      
      return {
        phoneNumber: updatedRow[0],
        name: updatedRow[1],
        firstContactDate: updatedRow[2],
        lastContactDate: updatedRow[3],
        messageCount: updatedRow[4],
        leadStatus: updatedRow[5],
        tags: updatedRow[6],
        notes: updatedRow[7],
        chatHistory: updatedRow[8]
      };
    } else {
      // Create new contact
      console.log(`🆕 Creating new contact: ${normalizedPhone}`);
      const newRow = [
        normalizedPhone, // Use normalized phone number
        name || 'Unknown',
        timestamp, // First contact date
        timestamp, // Last contact date
        1, // Message count
        'browsing', // Lead status
        '', // Tags
        '', // Notes
        '' // Empty chat history initially (column 9)
      ];
      
      await appendSheetValues('Contacts', newRow);
      
      return {
        phoneNumber: newRow[0],
        name: newRow[1],
        firstContactDate: newRow[2],
        lastContactDate: newRow[3],
        messageCount: newRow[4],
        leadStatus: newRow[5],
        tags: newRow[6],
        notes: newRow[7],
        chatHistory: newRow[8]
      };
    }
  } catch (error) {
    console.error('Error creating/updating contact:', error.message);
    return null;
  }
};

// Add message to contact's chat history
const addMessageToContactHistory = async (phoneNumber, userMessage, aiResponse) => {
  try {
    // Normalize phone number for consistent storage
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`💬 Adding message to contact history: ${normalizedPhone}`);
    
    const rows = await getSheetValues('Contacts');
    const contacts = rows.slice(1); // Skip header
    const contactIndex = contacts.findIndex(row => {
      if (!row || row.length === 0) return false;
      // Normalize both phone numbers for comparison
      const storedPhone = normalizePhoneNumber(String(row[0] || ''));
      const searchPhone = normalizePhoneNumber(normalizedPhone);
      const match = storedPhone === searchPhone;
      return match;
    });
    
    if (contactIndex !== -1) {
      const existingContact = [...contacts[contactIndex]]; // Create a copy
      const timestamp = new Date().toISOString();
      
      // Ensure the contact row has enough columns
      while (existingContact.length < 9) {
        existingContact.push('');
      }
      
      // Format messages for chat history
      let chatHistory = existingContact[8] || ''; // Chat history is in column 9 (index 8)
      
      // Add user message
      if (userMessage) {
        chatHistory += `[${formatTimestamp(timestamp)}] Customer: ${userMessage}\n`;
      }
      
      // Add AI response
      if (aiResponse) {
        chatHistory += `[${formatTimestamp(timestamp)}] AI: ${aiResponse}\n`;
      }
      
      // Update chat history in contact row
      existingContact[8] = chatHistory; // Update chat history column
      
      // Also update last contact date and message count
      existingContact[3] = timestamp; // Update last contact date
      existingContact[4] = (parseInt(existingContact[4]) || 0) + 1; // Increment message count
      
      await updateSheetValues('Contacts', contactIndex + 2, existingContact);
      
      console.log(`✅ Updated contact chat history for: ${normalizedPhone}`);
      return true;
    }
    
    console.log(`❓ Contact not found for chat history update: ${normalizedPhone}`);
    return false;
  } catch (error) {
    console.error('Error updating contact chat history:', error.message);
    return false;
  }
};

// Get contact chat history
const getContactChatHistory = async (phoneNumber, limit = 10) => {
  try {
    // Normalize phone number for consistent lookup
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`🔍 Loading chat history for: ${normalizedPhone}`);
    
    const contact = await getContact(normalizedPhone);
    
    if (contact && contact.chatHistory) {
      // Parse chat history into structured format
      const historyLines = contact.chatHistory.trim().split('\n');
      const messages = [];
      
      for (const line of historyLines) {
        const match = line.match(/\[(.*?)\] (.*?): (.*)/);
        if (match) {
          messages.push({
            timestamp: match[1],
            role: match[2].toLowerCase() === 'customer' ? 'user' : 'assistant',
            message: match[3]
          });
        }
      }
      
      console.log(`📚 Loaded ${messages.length} previous messages for ${normalizedPhone}`);
      return messages.slice(-limit); // Return last N messages
    }
    
    console.log(`⚠️ No chat history found for: ${normalizedPhone}`);
    return [];
  } catch (error) {
    console.error('Error loading contact chat history:', error.message);
    return [];
  }
};

// Lead management (simplified since it's now part of Contacts)
const updateContactLeadStatus = async (phoneNumber, status) => {
  try {
    // Normalize phone number for consistent comparison
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    const rows = await getSheetValues('Contacts');
    const contacts = rows.slice(1); // Skip header
    const contactIndex = contacts.findIndex(row => {
      if (!row || row.length === 0) return false;
      // Normalize both phone numbers for comparison
      const storedPhone = normalizePhoneNumber(String(row[0] || ''));
      const searchPhone = normalizePhoneNumber(normalizedPhone);
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

// Helper function to normalize phone numbers
const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // If it starts with +, keep it
  if (normalized.startsWith('+')) {
    return normalized;
  }
  
  // If it's all digits and longer than 10, assume it has country code
  if (normalized.length > 10 && /^\d+$/.test(normalized)) {
    return '+' + normalized;
  }
  
  return normalized;
};

// Helper function to format timestamps for chat history
const formatTimestamp = (isoString) => {
  const date = new Date(isoString);
  return date.toISOString().replace('T', ' ').substring(0, 16);
};

module.exports = {
  getContact,
  createOrUpdateContact,
  addMessageToContactHistory,
  getContactChatHistory,
  updateContactLeadStatus,
  generateSessionId
};