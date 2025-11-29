const axios = require('axios');

/**
 * Get AI response from Gemini using REST API
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Promise<string>} AI response
 */
async function getGeminiResponse(userMessage, conversationHistory = []) {
  try {
    // Build conversation context
    const systemInstruction = `You are a helpful sales assistant for a business on WhatsApp. Your goals are:
1. Have natural, friendly conversations with customers
2. Identify if customers are genuinely interested in buying (leads)
3. Ask relevant questions to understand their needs
4. Be concise - keep responses under 3 sentences when possible
5. If someone shows buying intent, politely ask for their name, what they're interested in, and when they need it

Buying signals include: asking about prices, availability, stock, payment methods, delivery, or wanting to place an order.`;
    
    let prompt = systemInstruction + '\n\n';
    
    // Add conversation history
    if (conversationHistory.length > 0) {
      prompt += 'Previous conversation:\n';
      conversationHistory.forEach(msg => {
        prompt += `User: ${msg.userMessage}\nAssistant: ${msg.aiResponse}\n`;
      });
      prompt += '\n';
    }
    
    // Add current message
    prompt += `User: ${userMessage}\nAssistant:`;

    // Call Gemini API using REST
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    console.error('Error calling Gemini API:', error.response?.data || error.message);
    
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
    detectBuyingIntent(msg.userMessage)
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
