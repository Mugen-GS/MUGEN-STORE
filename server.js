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
const { getGeminiResponse, detectBuyingIntent, calculateLeadScore } = require('./geminiService');
const { sendWhatsAppMessage, markAsRead } = require('./whatsappService');
const { 
  getContact, 
  createOrUpdateContact, 
  addMessageToContactHistory, 
  getContactChatHistory,
  updateContactLeadStatus,
  generateSessionId
} = require('./dataManager');
const { getSheetValues, appendSheetValues, initializeSheets } = require('./sheetsService');
const { getTrainingData, getAIMemory, addMemory, buildEnhancedPrompt } = require('./aiTraining');

// WhatsApp webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
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
            
            // Mark message as read
            try {
              await markAsRead(messageId);
            } catch (readError) {
              console.error('[WARN] Failed to mark message as read:', readError.message);
            }
            
            if (messageType === 'text') {
              const userMessage = message.text.body;
              console.log(`\n=== 📱 NEW MESSAGE FROM ${from} ===`);
              console.log(`Message: ${userMessage}`);
              
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
                console.log(`[INFO] Buying intent detected from ${contactName}`);
                
                // Calculate lead score
                const allHistory = await getContactChatHistory(from, 100);
                const leadScore = calculateLeadScore(allHistory);
                
                // Update contact as lead
                if (leadScore > 60) {
                  await updateContactLeadStatus(from, 'hot lead');
                } else if (leadScore > 30) {
                  await updateContactLeadStatus(from, 'interested');
                }
                
                console.log(`[INFO] Lead score for ${contactName}: ${leadScore}/100`);
              }
              
              // Send AI response back to user
              try {
                await sendWhatsAppMessage(from, aiResponse);
                console.log(`[INFO] Response sent to ${contactName}`);
                console.log(`Response: ${aiResponse}`);
              } catch (sendError) {
                console.error(`[ERROR] Failed to send response to ${contactName}:`, sendError.message);
              }
            } else {
              console.log(`[INFO] Received ${messageType} message from ${from} - not handled yet`);
            }
          }
          
          // Handle message status updates (delivered, read, etc.)
          if (value.statuses && value.statuses.length > 0) {
            const status = value.statuses[0];
            // Only log errors or important statuses
            if (status.status !== 'sent' && status.status !== 'delivered' && status.status !== 'read') {
              console.log(`[STATUS] ${status.status} for message ${status.id}`);
            }
          }
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('[ERROR] Failed to process webhook:', error);
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
    
    // Get contact count and calculate total messages
    const contacts = await getSheetValues('Contacts');
    const contactCount = contacts.length > 1 ? contacts.length - 1 : 0; // Subtract header
    
    // Calculate total messages from all contacts
    let totalMessages = 0;
    if (contacts.length > 1) {
      // Skip header row and sum message counts
      for (let i = 1; i < contacts.length; i++) {
        const contact = contacts[i];
        if (contact.length > 4) {
          totalMessages += parseInt(contact[4]) || 0; // Message count is in column 5 (index 4)
        }
      }
    }
    
    res.json({
      trainingExamples: training.length,
      memoryItems: memoryCount,
      totalContacts: contactCount,
      totalMessages: totalMessages
    });
  } catch (error) {
    console.error('[ERROR] Failed to get stats:', error.message);
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

// API: Test the AI with TrainingChats personality
app.post('/api/test-chat', async (req, res) => {
  try {
    const { message, phone = '+1234567890' } = req.body;
    console.log(`\n=== 🧪 TESTING AI FOR ${phone} ===`);
    console.log(`Message: ${message}`);
    
    // Get or create contact
    let contact = await getContact(phone);
    if (!contact) {
      contact = await createOrUpdateContact(phone);
    }
    
    // Get AI response with full context (same as WhatsApp)
    const aiResponse = await getGeminiResponse(message, [], phone);
    
    // Add messages to contact's chat history
    await addMessageToContactHistory(phone, message, aiResponse);
    
    console.log(`[INFO] AI Response: ${aiResponse}`);
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('[ERROR] Test chat failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get conversation history for test UI
app.get('/api/test-history', async (req, res) => {
  try {
    const phone = req.query.phone;
    const history = await getContactChatHistory(phone, 20);
    res.json({ history });
  } catch (error) {
    console.error('[ERROR] Failed to load test history:', error.message);
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
