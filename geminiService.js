const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize Gemini model (use gemini-1.5-flash for free tier)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// System instruction for the AI assistant
const SYSTEM_INSTRUCTION = `You are a helpful sales assistant for a business on WhatsApp. Your goals are:
1. Have natural, friendly conversations with customers
2. Identify if customers are genuinely interested in buying (leads)
3. Ask relevant questions to understand their needs
4. Be concise - keep responses under 3 sentences when possible
5. If someone shows buying intent, politely ask for their name, what they're interested in, and when they need it

Buying signals include: asking about prices, availability, stock, payment methods, delivery, or wanting to place an order.`;

/**
 * Get AI response from Gemini
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Promise<string>} AI response
 */
async function getGeminiResponse(userMessage, conversationHistory = []) {
  try {
    // Build conversation context
    let prompt = SYSTEM_INSTRUCTION + '\n\n';
    
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

    // Generate response
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return text.trim();
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
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
