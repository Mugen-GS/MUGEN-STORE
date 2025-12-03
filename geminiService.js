const axios = require('axios');
const { buildEnhancedPrompt } = require('./aiTraining');

/**
 * Get AI response from Gemini using REST API
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages for context (deprecated, now using sheets)
 * @param {string} phoneNumber - Customer's phone number for context
 * @returns {Promise<string>} AI response
 */
async function getGeminiResponse(userMessage, conversationHistory = [], phoneNumber = null) {
  try {
    // Build enhanced prompt with personality + customer context from sheets
    const systemInstruction = await buildEnhancedPrompt(phoneNumber);
    
    let prompt = systemInstruction + '\n\n';
    
    // Add current message
    prompt += `User: ${userMessage}\nAssistant:`;

    // Call Gemini API using REST (gemini-2.5-flash is fastest free model)
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const text = response.data.candidates[0].content.parts[0].text;
    return text.trim();
  } catch (error) {
    console.error('[ERROR] Failed to call Gemini API:', error.message);
    
    // Fallback response if API fails
    return "Hello! I'm here to help you. How can I assist you today?";
  }
}

/**
 * Analyze if message shows buying intent
 * @param {string} message - User's message
 * @returns {boolean} True if buying intent detected
 */
function detectBuyingIntent(message) {
  const buyingKeywords = [
    'price', 'cost', 'how much', 'buy', 'purchase', 'order',
    'available', 'in stock', 'delivery', 'shipping', 'payment',
    'pay', 'urgent', 'need it', 'want to buy', 'interested in buying'
  ];
  
  const lowerMessage = message.toLowerCase();
  return buyingKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Calculate lead score based on conversation
 * @param {Array} conversationHistory - All messages from user
 * @returns {number} Score from 0-100
 */
function calculateLeadScore(conversationHistory) {
  let score = 0;
  
  // Base score for any contact
  score += 10;
  
  // More messages = more engaged
  score += Math.min(conversationHistory.length * 5, 30);
  
  // Check for buying intent in messages
  const buyingMessages = conversationHistory.filter(msg => 
    detectBuyingIntent(msg.message) && msg.role === 'user'
  );
  score += buyingMessages.length * 20;
  
  // Cap at 100
  return Math.min(score, 100);
}

module.exports = {
  getGeminiResponse,
  detectBuyingIntent,
  calculateLeadScore
};