const axios = require('axios');
const { getSheetValues } = require('./sheetsService');

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
      
      console.log(`✅ Loaded ${conversations.length} training conversations`);
      return conversations;
    }
    
    return [];
  } catch (error) {
    console.error('Error loading training data:', error.message);
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
    console.error('Error loading AI memory:', error.message);
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

    console.log(`✅ Added to AI Memory: ${category} - ${key}`);
    return response.data;
  } catch (error) {
    console.error('Error adding memory:', error.message);
    return { success: false };
  }
}

/**
 * Get customer conversation history from "Messages" sheet
 * for maintaining context with returning customers
 */
async function getCustomerHistory(phoneNumber, limit = 10) {
  try {
    console.log(`🔍 Loading customer history for: ${phoneNumber}`);
    const rows = await getSheetValues('Messages');
    const messages = rows.slice(1); // Skip header
    
    console.log(`📋 Total message rows received: ${messages.length}`);
    
    // Filter for this customer's messages where role is 'user' or 'assistant'
    const customerMessages = messages
      .filter(row => {
        if (!row || row.length < 5) {
          console.log(`  ❌ Skipping invalid row:`, row);
          return false;
        }
        // Handle type differences - convert both to strings for comparison
        const storedPhone = String(row[1]); // Phone number is in column 2 (index 1)
        const searchPhone = String(phoneNumber);
        const match = storedPhone === searchPhone;
        console.log(`  🔍 Filtering message row: '${storedPhone}' === '${searchPhone}' ? ${match}`);
        return match && (row[3] === 'user' || row[3] === 'assistant'); // Role is in column 4 (index 3)
      })
      .map(row => ({
        timestamp: row[2],
        userMessage: row[3] === 'user' ? row[4] : '',
        aiResponse: row[3] === 'assistant' ? row[4] : ''
      }))
      .reduce((acc, curr) => {
        // Group user and assistant messages together
        if (curr.userMessage) {
          acc.push({ timestamp: curr.timestamp, userMessage: curr.userMessage, aiResponse: '' });
        } else if (curr.aiResponse && acc.length > 0) {
          // Add AI response to the last user message
          acc[acc.length - 1].aiResponse = curr.aiResponse;
        }
        return acc;
      }, [])
      .slice(-limit); // Get last N conversations
    
    console.log(`📚 Loaded ${customerMessages.length} previous messages for ${phoneNumber}`);
    if (customerMessages.length > 0) {
      console.log('📝 Sample messages:');
      customerMessages.slice(0, 2).forEach((msg, idx) => {
        console.log(`  ${idx+1}. User: ${msg.userMessage.substring(0, 50)}...`);
        console.log(`     AI: ${msg.aiResponse.substring(0, 50)}...`);
      });
    }
    return customerMessages;
  } catch (error) {
    console.error('❌ Error loading customer history:', error.message);
    return [];
  }
}

/**
 * Build enhanced system prompt with personality + context
 */
async function buildEnhancedPrompt(phoneNumber = null) {
  console.log(`\n=== 🧠 BUILDING AI PROMPT ===`);
  console.log(`Phone number: ${phoneNumber || 'None'}`);
  
  const trainingData = await getTrainingData();
  const memory = await getAIMemory();
  
  console.log(`Training examples: ${trainingData.length}`);
  console.log(`Memory categories: ${Object.keys(memory).length}`);
  
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
  } else {
    console.log('⚠️ No training data loaded from TrainingChats sheet');
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
    console.log(`✅ Loaded business knowledge: ${Object.keys(memory).join(', ')}`);
  } else {
    console.log('⚠️ No business knowledge in AI Memory sheet');
  }
  
  // Add customer conversation history if available
  if (phoneNumber) {
    const customerHistory = await getCustomerHistory(phoneNumber);
    if (customerHistory.length > 0) {
      prompt += `\n=== YOUR PREVIOUS CHAT WITH THIS CUSTOMER ===\n`;
      customerHistory.forEach((msg, idx) => {
        prompt += `[Message ${idx + 1}]\n`;
        prompt += `Customer: ${msg.userMessage}\n`;
        prompt += `You: ${msg.aiResponse}\n\n`;
      });
      prompt += `=== END PREVIOUS CHAT ===\n\n`;
      console.log(`✅ Added ${customerHistory.length} previous messages to prompt`);
    } else {
      prompt += `\n(NEW CUSTOMER - No previous messages)\n\n`;
      console.log('⚠️ No previous conversation history for this customer');
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
  
  console.log(`Prompt length: ${prompt.length} characters`);
  console.log('========================\n');
  
  return prompt;
}

module.exports = {
  getTrainingData,
  getAIMemory,
  addMemory,
  buildEnhancedPrompt,
  getCustomerHistory
};