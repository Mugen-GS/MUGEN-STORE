require('dotenv').config();
const express = require('express');
const { sendWhatsAppMessage, markAsRead } = require('./whatsappService');
const { getGeminiResponse, detectBuyingIntent, calculateLeadScore } = require('./geminiService');
const { 
  createOrUpdateUser, 
  saveConversation, 
  getUserConversationHistory,
  saveLead 
} = require('./dataManager');
const { initializeSheets } = require('./sheetsService');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Webhook verification (required by WhatsApp)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified successfully!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook to receive messages
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Check if it's a WhatsApp message
    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry;

      for (const entry of entries) {
        const changes = entry.changes;

        for (const change of changes) {
          const value = change.value;

          // Check if there are messages
          if (value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const from = message.from; // Sender's phone number
            const messageId = message.id;
            const messageType = message.type;

            // Get contact name if available
            const contactName = value.contacts?.[0]?.profile?.name || 'Unknown';

            // Only handle text messages for now
            if (messageType === 'text') {
              const userMessage = message.text.body;
              
              console.log(`\n📨 Message from ${contactName} (${from}): ${userMessage}`);

              // Mark message as read
              await markAsRead(messageId);

              // Save/update user
              const user = await createOrUpdateUser(from, contactName);

              // Get conversation history for context
              const conversationHistory = await getUserConversationHistory(from, 5);

              // Get AI response from Gemini
              const aiResponse = await getGeminiResponse(userMessage, conversationHistory);

              // Save conversation
              await saveConversation(from, userMessage, aiResponse);

              // Detect buying intent
              const hasBuyingIntent = detectBuyingIntent(userMessage);
              
              if (hasBuyingIntent) {
                console.log(`🔥 BUYING INTENT DETECTED from ${contactName}!`);
                
                // Calculate lead score
                const allHistory = await getUserConversationHistory(from, 100);
                const leadScore = calculateLeadScore(allHistory);
                
                // Save as lead
                const leadData = {
                  status: leadScore > 60 ? 'ready_to_buy' : 'interested',
                  score: leadScore,
                  notes: `Last message: ${userMessage}`
                };
                
                await saveLead(from, contactName, leadData);
                console.log(`💾 Lead saved with score: ${leadScore}/100`);
              }

              // Send AI response back to user
              await sendWhatsAppMessage(from, aiResponse);
              console.log(`✅ Response sent: ${aiResponse}\n`);
            } else {
              console.log(`ℹ️ Received ${messageType} message from ${from} - not handled yet`);
            }
          }

          // Handle message status updates (delivered, read, etc.)
          if (value.statuses && value.statuses.length > 0) {
            const status = value.statuses[0];
            console.log(`📊 Status update: ${status.status} for message ${status.id}`);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.sendStatus(500);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'WhatsApp Gemini Bot is running!',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, async () => {
  console.log('🚀 WhatsApp Gemini AI Bot Started!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  
  // Initialize Google Sheets
  await initializeSheets();
  
  console.log('\n⏳ Waiting for messages...\n');
});
