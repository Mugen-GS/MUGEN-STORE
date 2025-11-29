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
const { getTrainingData, getAIMemory, addMemory } = require('./aiTraining');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serve admin UI

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
    
    // Log full webhook data for debugging
    console.log('\n=== WEBHOOK RECEIVED ===');
    console.log(JSON.stringify(body, null, 2));
    console.log('========================\n');

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

              // Get AI response from Gemini with customer context
              const aiResponse = await getGeminiResponse(userMessage, [], from);

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

// Admin UI
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// Teach UI - Chat interface to teach the AI
app.get('/teach', (req, res) => {
  res.sendFile(__dirname + '/public/teach.html');
});

// Test UI - Test the AI with TrainingChats personality
app.get('/test', (req, res) => {
  res.sendFile(__dirname + '/public/test.html');
});

// Admin API: Add memory
app.post('/admin/add-memory', async (req, res) => {
  try {
    const { category, key, value, notes } = req.body;
    const result = await addMemory(category, key, value, notes);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin API: Get memory
app.get('/admin/memory', async (req, res) => {
  try {
    const memory = await getAIMemory();
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin API: Get stats
app.get('/admin/stats', async (req, res) => {
  try {
    const training = await getTrainingData();
    const memory = await getAIMemory();
    
    const memoryCount = Object.values(memory).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
    
    res.json({
      trainingExamples: training.length,
      memoryItems: memoryCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Gemini models endpoint
app.get('/test-models', async (req, res) => {
  try {
    const axios = require('axios');
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    
    const models = response.data.models
      .filter(m => m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name);
    
    res.json({ 
      availableModels: models,
      recommendation: models[0]
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.response?.data || error.message 
    });
  }
});

// API: Teach the AI (intelligent conversation that extracts and saves knowledge)
app.post('/api/teach', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Get AI response with instruction to extract info
    const teachPrompt = `You are MUGEN's business assistant. A human is teaching you about the business.

User said: "${message}"

Your tasks:
1. Acknowledge what they taught you
2. Extract key information (products, prices, policies, etc.)
3. Ask a follow-up question to learn more

Respond naturally and conversationally.`;

    const axios = require('axios');
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{ text: teachPrompt }]
        }]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const aiResponse = response.data.candidates[0].content.parts[0].text.trim();
    
    // Simple keyword extraction for auto-saving
    const saved = [];
    const lowerMessage = message.toLowerCase();
    
    // Extract product info
    if (lowerMessage.includes('product') || lowerMessage.includes('sell') || lowerMessage.includes('offer')) {
      const match = message.match(/([A-Z][\w\s]+?)(?=\s(?:for|costs?|prices?|is|are)|$)/i);
      if (match) {
        await addMemory('products', match[1].trim(), message, '');
        saved.push('Product info');
      }
    }
    
    // Extract pricing
    if (lowerMessage.match(/\$\d+|\d+\s?(?:dollars?|usd|price)/)) {
      await addMemory('pricing', `Price info - ${new Date().toLocaleDateString()}`, message, '');
      saved.push('Pricing');
    }
    
    // Extract policy
    if (lowerMessage.includes('policy') || lowerMessage.includes('return') || lowerMessage.includes('warranty')) {
      await addMemory('policies', `Policy - ${new Date().toLocaleDateString()}`, message, '');
      saved.push('Policy');
    }
    
    res.json({ response: aiResponse, saved });
  } catch (error) {
    console.error('Error in teach API:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Test chat with AI (simulates WhatsApp conversation)
app.post('/api/test/chat', async (req, res) => {
  try {
    const { message, phone } = req.body;
    
    // Save/update user
    await createOrUpdateUser(phone, 'Test User');
    
    // Get AI response with full context (same as WhatsApp)
    const aiResponse = await getGeminiResponse(message, [], phone);
    
    // Save conversation
    await saveConversation(phone, message, aiResponse);
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error in test chat:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get conversation history for test UI
app.get('/api/test/history', async (req, res) => {
  try {
    const phone = req.query.phone;
    const history = await getUserConversationHistory(phone, 20);
    res.json({ history });
  } catch (error) {
    console.error('Error loading history:', error.message);
    res.status(500).json({ error: error.message });
  }
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
