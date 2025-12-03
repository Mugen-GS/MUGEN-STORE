const axios = require('axios');
const { getSheetValues } = require('./sheetsService');
const { getContactChatHistory } = require('./dataManager');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

/**
 * Get training conversations from "TrainingChats" sheet (deprecated but kept for backward compatibility)
 * Returns examples of how MUGEN communicates
 * Format: DateTime | Sender | Message
 */
async function getTrainingData() {
  try {
    const response = await axios.get(APPS_SCRIPT_URL, {
      params: {
        action: 'getRows',
        sheet: 'TrainingChats'
      }
    });

    if (response.data.success) {
      const rows = response.data.data.slice(1); // Skip header
      
      // Group messages into conversations
      const conversations = [];
      let currentConvo = [];
      
      rows.forEach(row => {
        const dateTime = row[0] || '';
        const sender = row[1] || '';
        const message = row[2] || '';
        
        // Skip if message is not a string or is empty
        if (typeof message !== 'string' || !message.trim()) return;
        
        currentConvo.push({ sender, message });
        
        // Group every 2-4 messages as a conversation example
        if (currentConvo.length >= 4) {
          conversations.push([...currentConvo]);
          currentConvo = [];
        }
      });
      
      // Add remaining messages
      if (currentConvo.length >= 2) {
        conversations.push(currentConvo);
      }
      
      return conversations;
    }
    
    return [];
  } catch (error) {
    console.error('[WARN] Failed to load training data:', error.message);
    return [];
  }
}

/**
 * Get stored memory/context from "AI Memory" sheet
 * Returns business info, FAQs, products, etc.
 */
async function getAIMemory() {
  try {
    const response = await axios.get(APPS_SCRIPT_URL, {
      params: {
        action: 'getRows',
        sheet: 'AI Memory'
      }
    });

    if (response.data.success) {
      const rows = response.data.data.slice(1); // Skip header
      
      // Format as key-value memory
      const memory = {};
      rows.forEach(row => {
        const category = row[0] || 'general';
        const key = row[1];
        const value = row[2];
        
        if (key && value) {
          if (!memory[category]) {
            memory[category] = {};
          }
          memory[category][key] = value;
        }
      });
      
      return memory;
    }
    
    return {};
  } catch (error) {
    console.error('[WARN] Failed to load AI memory:', error.message);
    return {};
  }
}

/**
 * Add new memory/knowledge to AI Memory sheet
 */
async function addMemory(category, key, value, notes = '') {
  try {
    const row = [category, key, value, notes, new Date().toISOString()];
    
    const response = await axios.post(
      `${APPS_SCRIPT_URL}?action=appendRow&sheet=AI Memory`,
      { values: row },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return response.data;
  } catch (error) {
    console.error('[ERROR] Failed to add memory:', error.message);
    return { success: false };
  }
}

/**
 * Get customer conversation history from contact's chat history
 * for maintaining context with returning customers
 */
async function getCustomerHistory(phoneNumber, limit = 10) {
  try {
    // Use the new efficient method to get chat history
    const customerMessages = await getContactChatHistory(phoneNumber, limit);
    return customerMessages;
  } catch (error) {
    console.error('[ERROR] Failed to load customer history:', error.message);
    return [];
  }
}

/**
 * Build enhanced system prompt with personality + context
 */
async function buildEnhancedPrompt(phoneNumber = null) {
  const trainingData = await getTrainingData();
  const memory = await getAIMemory();
  
  let prompt = `You are MUGEN's AI assistant for WhatsApp. MUGEN sells sleeper PCs (office desktops upgraded with GPU and other gaming parts).\n\n`;
  
  // Add personality training from "TrainingChats" sheet
  if (trainingData.length > 0) {
    prompt += `HOW TO TALK (copy MUGEN's style):\n`;
    trainingData.slice(0, 3).forEach((convo, i) => {
      prompt += `Example ${i + 1}:\n`;
      convo.forEach(msg => {
        const isMugen = msg.sender.includes('MUGEN') && !msg.sender.includes('ＳｐｉｒｉｃＸ');
        prompt += `${isMugen ? 'MUGEN' : 'Customer'}: ${msg.message}\n`;
      });
      prompt += `\n`;
    });
  }
  
  // Add business context
  if (Object.keys(memory).length > 0) {
    prompt += `\nWHAT MUGEN SELLS:\n`;
    
    for (const [category, items] of Object.entries(memory)) {
      prompt += `\n${category.toUpperCase()}:\n`;
      for (const [key, value] of Object.entries(items)) {
        prompt += `- ${key}: ${value}\n`;
      }
    }
  }
  
  // Add customer conversation history if available
  if (phoneNumber) {
    const customerHistory = await getCustomerHistory(phoneNumber);
    if (customerHistory.length > 0) {
      prompt += `\n=== YOUR PREVIOUS CHAT WITH THIS CUSTOMER ===\n`;
      customerHistory.forEach((msg, idx) => {
        prompt += `[Message ${idx + 1}]\n`;
        prompt += `${msg.role === 'user' ? 'Customer' : 'You'}: ${msg.message}\n\n`;
      });
      prompt += `=== END PREVIOUS CHAT ===\n\n`;
    }
  }
  
  prompt += `\nRULES:
1. ONLY say "first chat" if there's NO previous messages above
2. If previous messages exist, reference them naturally ("like we talked about...", "you mentioned...", "as discussed earlier...")
3. Talk EXACTLY like MUGEN - casual, direct, helpful
4. Use info from "WHAT MUGEN SELLS" section to answer questions
5. Keep it SHORT (1-2 sentences unless technical)
6. NEVER make up info - only use what's in this prompt
7. If customer asks about something from previous chat, quote or reference it specifically
8. If customer is returning, acknowledge it: "Hey again!" or "Welcome back!"
9. If customer asks about something NOT in previous chats, say you don't remember that specific detail
10. Always be honest about what you do/don't know from past conversations\n\n`;
  
  return prompt;
}

module.exports = {
  getTrainingData,
  getAIMemory,
  addMemory,
  buildEnhancedPrompt,
  getCustomerHistory
};