const axios = require('axios');

/**
 * Send a text message via WhatsApp Business API
 * @param {string} to - Recipient phone number
 * @param {string} message - Message to send
 * @returns {Promise<Object>} API response
 */
async function sendWhatsAppMessage(to, message) {
  // Validate inputs
  if (!to || !message) {
    throw new Error('Missing required parameters: to, message');
  }
  
  // Ensure message is not empty
  const cleanMessage = String(message).trim();
  if (!cleanMessage) {
    throw new Error('Message cannot be empty');
  }
  
  const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: {
      body: cleanMessage
    }
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log(`📤 WhatsApp Message Sent to ${to}: ${cleanMessage}`);
    return response.data;
  } catch (error) {
    console.error('❌ WhatsApp Error:', error.response?.data?.error?.message || error.message);
    throw error;
  }
}

/**
 * Mark message as read
 * @param {string} messageId - Message ID to mark as read
 */
async function markAsRead(messageId) {
  // Validate input
  if (!messageId) {
    throw new Error('Missing required parameter: messageId');
  }
  
  const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  
  const data = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  };

  try {
    await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout
    });
  } catch (error) {
    console.error('Error marking message as read:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendWhatsAppMessage,
  markAsRead
};