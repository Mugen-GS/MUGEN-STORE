const axios = require('axios');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

/**
 * Get training conversations from "TrainingChats" sheet
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
        
        if (!message.trim()) return;
        
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
 * Get customer conversation history from "Mugen Store Chats" sheet
 * for maintaining context with returning customers
 */
async function getCustomerHistory(phoneNumber, limit = 10) {
  try {
    const response = await axios.get(APPS_SCRIPT_URL, {
      params: {
        action: 'getRows',
        sheet: 'Conversations'
      }
    });

    if (response.data.success) {
      const rows = response.data.data.slice(1); // Skip header
      
      // Filter for this customer's conversations
      const customerMessages = rows
        .filter(row => row[0] === phoneNumber)
        .map(row => ({
          timestamp: row[1],
          userMessage: row[2],
          aiResponse: row[3]
        }))
        .slice(-limit); // Get last N conversations
      
      return customerMessages;
    }
    
    return [];
  } catch (error) {
    console.error('Error loading customer history:', error.message);
    return [];
  }
}

/**
 * Build enhanced system prompt with personality + context
 */
async function buildEnhancedPrompt(phoneNumber = null) {
  const trainingData = await getTrainingData();
  const memory = await getAIMemory();
  
  let prompt = `You are an AI assistant that mimics MUGEN's communication style for a WhatsApp business account.\n\n`;
  
  // Add personality training from "TrainingChats" sheet
  if (trainingData.length > 0) {
    prompt += `COMMUNICATION STYLE (learn from these examples of how MUGEN talks):\n`;
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
    prompt += `\nBUSINESS KNOWLEDGE:\n`;
    
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
      prompt += `\nPREVIOUS CONVERSATION WITH THIS CUSTOMER:\n`;
      customerHistory.forEach(msg => {
        prompt += `Customer: ${msg.userMessage}\n`;
        prompt += `You (MUGEN): ${msg.aiResponse}\n`;
      });
      prompt += `\n`;
    }
  }
  
  prompt += `\nINSTRUCTIONS:
1. Respond in MUGEN's style (casual, helpful, knowledgeable about tech/products)
2. Use the business knowledge above to answer questions accurately
3. Remember the previous conversation with this customer and maintain context
4. Keep responses concise (2-3 sentences max unless explaining something complex)
5. If someone shows buying intent, ask for their needs and budget
6. Be friendly but professional\n\n`;
  
  return prompt;
}

module.exports = {
  getTrainingData,
  getAIMemory,
  addMemory,
  buildEnhancedPrompt,
  getCustomerHistory
};
