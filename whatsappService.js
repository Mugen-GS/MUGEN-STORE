const axios = require('axios');

/**
 * Send a text message via WhatsApp Business API
 * @param {string} to - Recipient phone number
 * @param {string} message - Message to send
 * @returns {Promise<Object>} API response
 */
async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: {
      body: message
    }
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📤 WhatsApp Message Sent to ${to}: ${message}`);
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
      }
    });
  } catch (error) {
    console.error('Error marking message as read:', error.response?.data || error.message);
  }
}

module.exports = {
  sendWhatsAppMessage,
  markAsRead
};
