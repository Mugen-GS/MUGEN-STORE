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
const { 
  sendWhatsAppMessage, 
  sendWhatsAppImage, 
  downloadMedia,
  markAsRead 
} = require('./whatsappService');
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

// Google Vision API (uncomment when library is available)
/*
const vision = require('@google-cloud/vision');
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_VISION_KEY_PATH || 'path/to/service-account-key.json',
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'your-project-id'
});
*/

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
              
              // Check if AI response indicates it needs help
              if (aiResponse.toLowerCase().includes('i don\'t understand') || 
                  aiResponse.toLowerCase().includes('i\'m not sure') ||
                  aiResponse.toLowerCase().includes('could you clarify') ||
                  aiResponse.toLowerCase().includes('help me understand')) {
                console.log(`[HELP REQUEST] AI needs help with message from ${from}: ${userMessage}`);
                // Send help request to API
                try {
                  await axios.post('/api/help-request', {
                    type: 'confusion',
                    message: `AI needs help understanding: "${userMessage}" - AI responded: "${aiResponse}"`,
                    from: from
                  });
                } catch (error) {
                  console.error('[ERROR] Failed to send help request:', error.message);
                }
              }
              
              // Send AI response back to user
              try {
                await sendWhatsAppMessage(from, aiResponse);
                console.log(`[INFO] Response sent to ${contactName}`);
                console.log(`Response: ${aiResponse}`);
              } catch (sendError) {
                console.error(`[ERROR] Failed to send response to ${contactName}:`, sendError.message);
              }
            } else if (messageType === 'image') {
              console.log(`\n=== 📱 NEW IMAGE FROM ${from} ===`);
              console.log(`Image ID: ${message.image.id}`);
              console.log(`Image MIME Type: ${message.image.mime_type}`);
              console.log(`Image SHA256: ${message.image.sha256}`);
              
              // Get or create contact with normalized phone number
              let contact = await getContact(from);
              if (!contact) {
                contact = await createOrUpdateContact(from);
              } else {
                contact = await createOrUpdateContact(from, contact.name);
              }
              
              // Get contact name
              const contactName = contact.name || 'Customer';
              
              // Download the image (prepare for analysis)
              try {
                console.log(`[INFO] Downloading image ${message.image.id} for analysis`);
                // Uncomment when Google Vision API is available
                /*
                const media = await downloadMedia(message.image.id);
                console.log(`[INFO] Image downloaded successfully. Size: ${media.data.length} bytes`);
                
                // Analyze image with Google Vision API
                const [result] = await visionClient.labelDetection(media.data);
                const labels = result.labelAnnotations;
                
                // Extract labels
                const imageLabels = labels.map(label => label.description).join(', ');
                console.log(`[INFO] Image labels: ${imageLabels}`);
                
                // Create a message with image analysis
                const imageInfo = `[Image received] ID: ${message.image.id}, Type: ${message.image.mime_type}, Labels: ${imageLabels}`;
                
                // Respond to image with analysis
                const aiResponse = `Thanks for sending that image! I can see this image contains: ${imageLabels}. How can I help you with this?`;
                */
                
                // For now, just record the image metadata
                const imageInfo = `[Image received] ID: ${message.image.id}, Type: ${message.image.mime_type}`;
                const aiResponse = "Thanks for sending that image! I'm an AI assistant and can't process images directly, but I've recorded your image and can help with any questions about our products or services.";
                
                // Add image info to contact's chat history
                await addMessageToContactHistory(from, imageInfo, aiResponse);
                
                // Send response back to user
                try {
                  await sendWhatsAppMessage(from, aiResponse);
                  console.log(`[INFO] Image response sent to ${contactName}`);
                  console.log(`Response: ${aiResponse}`);
                } catch (sendError) {
                  console.error(`[ERROR] Failed to send image response to ${contactName}:`, sendError.message);
                }
                
                // Notify that AI can't process images
                console.log(`[HELP REQUEST] AI cannot process image from ${from}. Image ID: ${message.image.id}`);
                // Send help request to API
                try {
                  await axios.post('/api/help-request', {
                    type: 'image_unsupported',
                    message: `AI cannot process image. Image ID: ${message.image.id}, Type: ${message.image.mime_type}`,
                    from: from
                  });
                } catch (error) {
                  console.error('[ERROR] Failed to send help request:', error.message);
                }
              } catch (downloadError) {
                console.error(`[ERROR] Failed to download image ${message.image.id}:`, downloadError.message);
                
                // Still record the image metadata even if download fails
                const imageInfo = `[Image received] ID: ${message.image.id}, Type: ${message.image.mime_type} (Download failed)`;
                const aiResponse = "Thanks for sending that image! I'm an AI assistant and can't process images directly, but I've recorded your image and can help with any questions about our products or services.";
                
                // Add image info to contact's chat history
                await addMessageToContactHistory(from, imageInfo, aiResponse);
                
                // Send response back to user
                try {
                  await sendWhatsAppMessage(from, aiResponse);
                  console.log(`[INFO] Image response sent to ${contactName}`);
                  console.log(`Response: ${aiResponse}`);
                } catch (sendError) {
                  console.error(`[ERROR] Failed to send image response to ${contactName}:`, sendError.message);
                }
              }

            } else {
              console.log(`[INFO] Received ${messageType} message from ${from} - not handled yet`);
              
              // Get or create contact with normalized phone number
              let contact = await getContact(from);
              if (!contact) {
                contact = await createOrUpdateContact(from);
              } else {
                contact = await createOrUpdateContact(from, contact.name);
              }
              
              // Get contact name
              const contactName = contact.name || 'Customer';
              
              // Respond to unsupported message types
              const aiResponse = `I received your ${messageType} message. I'm an AI assistant and can currently handle text messages. Please send me a text message if you have any questions!`;
              
              // Add messages to contact's chat history
              await addMessageToContactHistory(from, `[${messageType} message received]`, aiResponse);
              
              // Send response back to user
              try {
                await sendWhatsAppMessage(from, aiResponse);
                console.log(`[INFO] Unsupported message response sent to ${contactName}`);
                console.log(`Response: ${aiResponse}`);
              } catch (sendError) {
                console.error(`[ERROR] Failed to send unsupported message response to ${contactName}:`, sendError.message);
              }
              
              // Notify that AI doesn't understand this message type
              console.log(`[HELP REQUEST] AI cannot understand ${messageType} message from ${from}`);
              // Send help request to API
              try {
                await axios.post('/api/help-request', {
                  type: 'unsupported_message',
                  message: `AI cannot understand ${messageType} message from ${from}`,
                  from: from
                });
              } catch (error) {
                console.error('[ERROR] Failed to send help request:', error.message);
              }
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

// Live Data Viewer Page
app.get('/live-data', (req, res) => {
  res.sendFile(__dirname + '/public/live-data.html');
});

// WhatsApp Dashboard Page
app.get('/whatsapp-dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/whatsapp-dashboard.html');
});

// Index Page (redirect to dashboard)
app.get('/index', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// API: Get business information from AI Memory (specific route for business info) - FIXED VERSION
app.get('/api/business-info', async (req, res) => {
  try {
    const memory = await getAIMemory();
    
    // Properly extract business information from AI Memory
    const businessInfo = {};
    
    // Extract from business category
    if (memory['business']) {
      businessInfo.companyName = memory['business']['name'] || '';
      businessInfo.industry = memory['business']['industry'] || '';
      businessInfo.targetAudience = memory['business']['target audience'] || '';
      businessInfo.uniqueSellingPoints = memory['business']['unique selling points'] || '';
      businessInfo.toneOfVoice = memory['business']['tone of voice'] || '';
    }
    
    // Extract products/services from products category
    if (memory['products']) {
      businessInfo.productsServices = memory['products']['services'] || '';
    }
    
    res.json(businessInfo);
  } catch (error) {
    console.error('[ERROR] Failed to get business info:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Save business information to AI Memory
app.post('/api/business-info', async (req, res) => {
  try {
    const {
      companyName,
      industry,
      productsServices,
      targetAudience,
      uniqueSellingPoints,
      toneOfVoice
    } = req.body;

    // Save each piece of information to AI Memory
    const promises = [];
    
    if (companyName) {
      promises.push(addMemory('business', 'name', companyName, 'Company name'));
    }
    
    if (industry) {
      promises.push(addMemory('business', 'industry', industry, 'Industry'));
    }
    
    if (productsServices) {
      promises.push(addMemory('products', 'services', productsServices, 'Products and services'));
    }
    
    if (targetAudience) {
      promises.push(addMemory('business', 'target audience', targetAudience, 'Target audience'));
    }
    
    if (uniqueSellingPoints) {
      promises.push(addMemory('business', 'unique selling points', uniqueSellingPoints, 'Unique selling points'));
    }
    
    if (toneOfVoice) {
      promises.push(addMemory('business', 'tone of voice', toneOfVoice, 'Preferred tone of voice'));
    }
    
    await Promise.all(promises);
    
    res.json({ success: true, message: 'Business information saved successfully' });
  } catch (error) {
    console.error('[ERROR] Failed to save business info:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get AI guidelines from AI Memory - FIXED VERSION
app.get('/api/guidelines', async (req, res) => {
  try {
    const memory = await getAIMemory();
    
    // Properly extract guidelines information from AI Memory
    const guidelines = {};
    
    // Extract from guidelines category
    if (memory['guidelines']) {
      guidelines.communicationStyle = memory['guidelines']['communication style'] || '';
      guidelines.responseLength = memory['guidelines']['response length'] || 'medium';
      guidelines.handlingObjections = memory['guidelines']['handling objections'] || '';
      guidelines.upsellingTechniques = memory['guidelines']['upselling techniques'] || '';
      guidelines.closingStrategies = memory['guidelines']['closing strategies'] || '';
      guidelines.doNotSay = memory['guidelines']['do not say'] || '';
    }
    
    res.json(guidelines);
  } catch (error) {
    console.error('[ERROR] Failed to get guidelines:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Save AI guidelines to AI Memory
app.post('/api/guidelines', async (req, res) => {
  try {
    const {
      communicationStyle,
      responseLength,
      handlingObjections,
      upsellingTechniques,
      closingStrategies,
      doNotSay
    } = req.body;

    // Save each guideline to AI Memory
    const promises = [];
    
    if (communicationStyle) {
      promises.push(addMemory('guidelines', 'communication style', communicationStyle, 'Communication style'));
    }
    
    if (responseLength) {
      promises.push(addMemory('guidelines', 'response length', responseLength, 'Response length preference'));
    }
    
    if (handlingObjections) {
      promises.push(addMemory('guidelines', 'handling objections', handlingObjections, 'How to handle objections'));
    }
    
    if (upsellingTechniques) {
      promises.push(addMemory('guidelines', 'upselling techniques', upsellingTechniques, 'Upselling techniques'));
    }
    
    if (closingStrategies) {
      promises.push(addMemory('guidelines', 'closing strategies', closingStrategies, 'Closing strategies'));
    }
    
    if (doNotSay) {
      promises.push(addMemory('guidelines', 'do not say', doNotSay, 'Things to avoid saying'));
    }
    
    await Promise.all(promises);
    
    res.json({ success: true, message: 'AI guidelines saved successfully' });
  } catch (error) {
    console.error('[ERROR] Failed to save guidelines:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Test AI with current business info and guidelines - FIXED VERSION
app.post('/api/test-ai', async (req, res) => {
  try {
    const { from, message } = req.body;
    console.log(`\n=== 🧪 TESTING AI FOR ${from} ===`);
    console.log(`Message: ${message}`);
    
    // Get or create contact
    let contact = await getContact(from);
    if (!contact) {
      contact = await createOrUpdateContact(from);
    }
    
    // Get AI response with full context (same as WhatsApp)
    const aiResponse = await getGeminiResponse(message, [], from);
    
    // Add messages to contact's chat history
    await addMessageToContactHistory(from, message, aiResponse);
    
    console.log(`[INFO] AI Response: ${aiResponse}`);
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('[ERROR] Test AI failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get test history (FIXED VERSION)
app.get('/api/test-history', async (req, res) => {
  try {
    // Get recent contacts with message counts
    const rows = await getSheetValues('Contacts');
    const contacts = rows.slice(1); // Skip header
    
    const testHistory = [];
    for (const contact of contacts) {
      if (contact && contact.length > 0) {
        const phone = contact[0];
        const messageCount = parseInt(contact[4]) || 0;
        
        // Only include contacts with messages
        if (messageCount > 0) {
          // Get recent chat history
          const chatHistory = await getContactChatHistory(phone, 5);
          
          // Find the most recent message
          if (chatHistory.length > 0) {
            // Look for the most recent user message
            for (let i = chatHistory.length - 1; i >= 0; i--) {
              const msg = chatHistory[i];
              if (msg.role === 'user') {
                // Find the AI response that follows this user message
                let aiResponse = 'No response yet';
                if (i + 1 < chatHistory.length && chatHistory[i + 1].role === 'assistant') {
                  aiResponse = chatHistory[i + 1].message;
                }
                
                testHistory.push({
                  phone: phone,
                  question: msg.message,
                  answer: aiResponse,
                  timestamp: msg.timestamp
                });
                break; // Only take the most recent user message
              }
            }
          }
        }
      }
    }
    
    // Sort by timestamp (most recent first)
    testHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(testHistory.slice(0, 20)); // Return last 20 test interactions
  } catch (error) {
    console.error('[ERROR] Failed to load test history:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get contact data
app.get('/api/contact/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const contact = await getContact(phoneNumber);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({
      phone: contact.phoneNumber,
      name: contact.name,
      firstInteraction: contact.firstContactDate,
      lastInteraction: contact.lastContactDate,
      messageCount: contact.messageCount,
      leadStatus: contact.leadStatus,
      tags: contact.tags,
      notes: contact.notes
    });
  } catch (error) {
    console.error('[ERROR] Failed to get contact data:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get contact chat history - FIXED VERSION
app.get('/api/contact-history/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const chatHistory = await getContactChatHistory(phoneNumber, 50);
    
    // Transform chat history into user/ai format for UI
    const transformedHistory = [];
    
    // Process messages in pairs (user message followed by AI response)
    for (let i = 0; i < chatHistory.length; i++) {
      const msg = chatHistory[i];
      
      if (msg.role === 'user') {
        const entry = {
          user: msg.message,
          timestamp: msg.timestamp
        };
        
        // Check if next message is AI response
        if (i + 1 < chatHistory.length && chatHistory[i + 1].role === 'assistant') {
          entry.ai = chatHistory[i + 1].message;
          i++; // Skip the next message since we've processed it
        }
        
        transformedHistory.push(entry);
      } else if (msg.role === 'assistant') {
        // Handle case where we might start with an AI message (shouldn't happen but just in case)
        transformedHistory.push({
          ai: msg.message,
          timestamp: msg.timestamp
        });
      }
    }
    
    res.json({ chatHistory: transformedHistory });
  } catch (error) {
    console.error('[ERROR] Failed to get contact history:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get all contacts
app.get('/api/contacts', async (req, res) => {
  try {
    const rows = await getSheetValues('Contacts');
    const contacts = rows.slice(1); // Skip header
    
    const contactList = contacts.map(contact => ({
      phone: contact[0],
      name: contact[1],
      firstInteraction: contact[2],
      lastInteraction: contact[3],
      messageCount: parseInt(contact[4]) || 0,
      leadStatus: contact[5],
      tags: contact[6]
    })).filter(contact => contact.phone && contact.messageCount > 0); // Only contacts with messages
    
    // Sort by last interaction (most recent first)
    contactList.sort((a, b) => new Date(b.lastInteraction) - new Date(a.lastInteraction));
    
    res.json(contactList);
  } catch (error) {
    console.error('[ERROR] Failed to get contacts:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Get system stats
app.get('/api/stats', async (req, res) => {
  try {
    console.log('[DEBUG] Loading system stats');
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
    
    const stats = {
      trainingExamples: training.length,
      memoryItems: memoryCount,
      totalContacts: contactCount,
      totalMessages: totalMessages
    };
    
    console.log('[DEBUG] Stats result:', stats);
    
    res.json(stats);
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

// API: Get conversation history for test UI (REMOVED - using /api/test-history instead)

// API: Test sending an image via WhatsApp
app.post('/api/test-image', async (req, res) => {
  try {
    const { phone, imageUrl, caption } = req.body;
    
    if (!phone || !imageUrl) {
      return res.status(400).json({ error: 'Phone number and image URL are required' });
    }
    
    const response = await sendWhatsAppImage(phone, imageUrl, caption);
    res.json({ 
      success: true, 
      message: 'Image sent successfully',
      response: response
    });
  } catch (error) {
    console.error('[ERROR] Failed to send test image:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// In-memory storage for help requests (in production, you might want to use a database)
let helpRequests = [];

// API: Add help request
app.post('/api/help-request', (req, res) => {
  try {
    const { type, message, from } = req.body;
    
    const helpRequest = {
      id: Date.now(),
      type,
      message,
      from,
      timestamp: new Date().toISOString()
    };
    
    helpRequests.push(helpRequest);
    
    // Keep only the last 50 help requests to prevent memory issues
    if (helpRequests.length > 50) {
      helpRequests = helpRequests.slice(-50);
    }
    
    res.json({ success: true, message: 'Help request added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get help requests
app.get('/api/help-requests', (req, res) => {
  try {
    // Return the last 10 help requests
    const recentRequests = helpRequests.slice(-10);
    res.json({ requests: recentRequests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Clear help requests
app.delete('/api/help-requests', (req, res) => {
  try {
    helpRequests = [];
    res.json({ success: true, message: 'Help requests cleared' });
  } catch (error) {
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
