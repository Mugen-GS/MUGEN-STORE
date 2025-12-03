const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Import services
const { getGeminiResponse } = require('./geminiService');
const { 
  getContact, 
  createOrUpdateContact, 
  saveMessage, 
  getContactMessageHistory,
  updateContactLeadStatus,
  generateSessionId
} = require('./dataManager');
const { getSheetValues, appendSheetValues, initializeSheets } = require('./sheetsService');
const { getTrainingData, getAIMemory, addMemory, buildEnhancedPrompt } = require('./aiTraining');

// WhatsApp webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    console.log('\n=== 📱 NEW WHATSAPP MESSAGE ===');
    
    const body = req.body;
    
    // Verify webhook (if needed)
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          
          // Handle incoming messages
          if (value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const from = message.from; // Phone number
            const messageType = message.type;
            const messageId = message.id;
            
            console.log(`📩 From: ${from}, Type: ${messageType}`);
            
            // Mark message as read
            try {
              await markAsRead(messageId);
            } catch (readError) {
              console.error('Error marking message as read:', readError.message);
            }
            
            if (messageType === 'text') {
              const userMessage = message.text.body;
              console.log(`💬 Message: ${userMessage}`);
              
              // Get or create contact with normalized phone number
              let contact = await getContact(from);
              if (!contact) {
                contact = await createOrUpdateContact(from);
              } else {
                contact = await createOrUpdateContact(from, contact.name);
              }
              
              // Get contact name
              const contactName = contact.name || 'Customer';
              
              // Get AI response with full context
              const aiResponse = await getGeminiResponse(userMessage, [], from);
              
              // Add messages to contact's chat history
              await addMessageToContactHistory(from, userMessage, aiResponse);
              
              // Detect buying intent
              const hasBuyingIntent = detectBuyingIntent(userMessage);
              
              if (hasBuyingIntent) {
                console.log(`🔥 BUYING INTENT DETECTED from ${contactName}!`);
                
                // Calculate lead score
                const allHistory = await getContactChatHistory(from, 100);
                const leadScore = calculateLeadScore(allHistory);
                
                // Update contact as lead
                if (leadScore > 60) {
                  await updateContactLeadStatus(from, 'hot lead');
                } else if (leadScore > 30) {
                  await updateContactLeadStatus(from, 'interested');
                }
                
                console.log(`💾 Contact updated with lead score: ${leadScore}/100`);
              }
              
              // Send AI response back to user
              try {
                await sendWhatsAppMessage(from, aiResponse);
                console.log(`✅ Response sent to ${contactName}: ${aiResponse}\n`);
              } catch (sendError) {
                console.error(`❌ Failed to send response to ${contactName}:`, sendError.message);
              }
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

// Unified Dashboard
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Business Information Page
app.get('/business-info', (req, res) => {
  res.sendFile(__dirname + '/public/business-info.html');
});

// AI Guidelines Page
app.get('/ai-guidelines', (req, res) => {
  res.sendFile(__dirname + '/public/ai-guidelines.html');
});

// AI Testing Page
app.get('/ai-testing', (req, res) => {
  res.sendFile(__dirname + '/public/ai-testing.html');
});

// API: Add business information to AI Memory
app.post('/api/business-info', async (req, res) => {
  try {
    const { category, key, value, notes } = req.body;
    const result = await addMemory(category, key, value, notes);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get business information from AI Memory
app.get('/api/business-info', async (req, res) => {
  try {
    const memory = await getAIMemory();
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Add AI guideline
app.post('/api/ai-guidelines', async (req, res) => {
  try {
    const { category, title, description, priority } = req.body;
    const row = [category, title, description, priority, 'Yes'];
    
    const response = await axios.post(
      `${process.env.APPS_SCRIPT_URL}?action=appendRow&sheet=AI Guidelines`,
      { values: row },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get AI guidelines
app.get('/api/ai-guidelines', async (req, res) => {
  try {
    const response = await axios.get(process.env.APPS_SCRIPT_URL, {
      params: {
        action: 'getRows',
        sheet: 'AI Guidelines'
      }
    });

    if (response.data.success) {
      const rows = response.data.data.slice(1); // Skip header
      const guidelines = rows.map(row => ({
        category: row[0],
        title: row[1],
        description: row[2],
        priority: row[3],
        active: row[4]
      }));
      res.json(guidelines);
    } else {
      res.status(500).json({ error: 'Failed to load guidelines' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get system stats
app.get('/api/stats', async (req, res) => {
  try {
    const training = await getTrainingData();
    const memory = await getAIMemory();
    
    const memoryCount = Object.values(memory).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
    
    // Get contact count
    const contacts = await getSheetValues('Contacts');
    const contactCount = contacts.length > 1 ? contacts.length - 1 : 0; // Subtract header
    
    // Get message count
    const messages = await getSheetValues('Messages');
    const messageCount = messages.length > 1 ? messages.length - 1 : 0; // Subtract header
    
    res.json({
      trainingExamples: training.length,
      memoryItems: memoryCount,
      totalContacts: contactCount,
      totalMessages: messageCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Teach the AI (simplified version)
app.post('/api/teach', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Get AI response
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `You are an AI assistant learning about a business. Based on this information shared about the business: "${message}", what category does this belong to and what would be a good key/value pair to store for future reference?\n\nRespond in JSON format with "category", "key", and "value" fields only.`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      }
    );

    const aiResponse = response.data.candidates[0].content.parts[0].text.trim();
    
    // Try to parse AI's suggestion
    let suggestion;
    try {
      // Extract JSON from response if it's wrapped in text
      const jsonMatch = aiResponse.match(/\{[^}]+\}/);
      if (jsonMatch) {
        suggestion = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.log('Could not parse AI suggestion');
    }
    
    // Save to AI Memory if we got a valid suggestion
    let saved = false;
    if (suggestion && suggestion.category && suggestion.key && suggestion.value) {
      await addMemory(suggestion.category, suggestion.key, suggestion.value, 'Auto-saved from teaching session');
      saved = true;
    }
    
    res.json({ 
      response: "Thanks for sharing that information! I've processed it and will use it to improve my responses.",
      saved: saved ? [`${suggestion.category}: ${suggestion.key}`] : [],
      suggestion: suggestion || null
    });
  } catch (error) {
    console.error('Error in teach API:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Test chat with AI
app.post('/api/test-chat', async (req, res) => {
  try {
    const { message, phone } = req.body;
    console.log(`\n=== 🧪 TESTING AI ===`);
    console.log(`Phone: ${phone}`);
    console.log(`Message: ${message}`);
    
    // Get AI response with full context (same as WhatsApp)
    const aiResponse = await getGeminiResponse(message, [], phone);
    
    // Save conversation
    const sessionId = generateSessionId(phone);
    await saveMessage({
      phoneNumber: phone,
      role: 'user',
      message: message,
      sessionId: sessionId
    });
    
    await saveMessage({
      phoneNumber: phone,
      role: 'assistant',
      message: aiResponse,
      sessionId: sessionId
    });
    
    console.log(`AI Response: ${aiResponse}`);
    console.log('==================\n');
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error in test chat:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get conversation history for test UI
app.get('/api/test-history', async (req, res) => {
  try {
    const phone = req.query.phone;
    console.log(`🔍 Loading history for phone: ${phone}`);
    const history = await getContactMessageHistory(phone, 20);
    console.log(`📊 Found ${history.length} history items`);
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

// Helper functions (moved from geminiService for simplicity)
function detectBuyingIntent(message) {
  const buyingKeywords = [
    'price', 'cost', 'how much', 'buy', 'purchase', 'order',
    'available', 'in stock', 'delivery', 'shipping', 'payment',
    'pay', 'urgent', 'need it', 'want to buy', 'interested in buying'
  ];
  
  const lowerMessage = message.toLowerCase();
  return buyingKeywords.some(keyword => lowerMessage.includes(keyword));
}

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