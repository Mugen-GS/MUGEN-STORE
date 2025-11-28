# WhatsApp Gemini AI Bot - Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```

Edit `.env` and add your credentials:

#### Get WhatsApp API Credentials:
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select existing one
3. Add WhatsApp product
4. Get:
   - `WHATSAPP_TOKEN`: Your access token
   - `WHATSAPP_PHONE_ID`: Your phone number ID
   - `WHATSAPP_VERIFY_TOKEN`: Create any random string (e.g., "myverifytoken123")

#### Get Gemini API Key:
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Copy it to `GEMINI_API_KEY`

#### Set up Google Sheets:
1. **Create a new Google Sheet**:
   - Go to [Google Sheets](https://sheets.google.com)
   - Create a new spreadsheet
   - Create 3 sheets named: `Users`, `Conversations`, `Leads`
   - Copy the Sheet ID from the URL (the long string between `/d/` and `/edit`)
   - Add it to `GOOGLE_SHEET_ID`

2. **Create Service Account**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or select existing)
   - Enable Google Sheets API
   - Go to "Credentials" → "Create Credentials" → "Service Account"
   - Create service account and download JSON key file
   - Copy the **entire JSON content** to `GOOGLE_SHEETS_CREDENTIALS` (as single line)

3. **Share the Sheet**:
   - Open your Google Sheet
   - Click "Share"
   - Add the service account email (from the JSON file: `client_email`)
   - Give it "Editor" permissions

### 3. Run the Server
```bash
npm start
```

Server will start on http://localhost:3000

### 4. Expose to Internet (for WhatsApp webhook)
WhatsApp needs a public URL. Use one of these:

**Option A: ngrok (Recommended for testing)**
```bash
ngrok http 3000
```
Copy the HTTPS URL (e.g., https://abc123.ngrok.io)

**Option B: Deploy to cloud**
- Heroku
- Railway
- Render
- DigitalOcean

### 5. Configure WhatsApp Webhook
1. Go to your WhatsApp app in Facebook Developers
2. Navigate to WhatsApp > Configuration
3. Edit webhook:
   - **Callback URL**: `https://your-url.com/webhook`
   - **Verify Token**: Same as `WHATSAPP_VERIFY_TOKEN` in .env
4. Subscribe to messages field
5. Click "Verify and Save"

## Data Storage

All data is stored in **Google Sheets** (persists across restarts!):

- **Users sheet**: All users who contacted you
  - Columns: Phone Number, Name, First Contact, Last Contact, Message Count, Lead Status, Notes
  
- **Conversations sheet**: Full message history
  - Columns: Phone Number, Timestamp, User Message, AI Response
  
- **Leads sheet**: Qualified leads only
  - Columns: Phone Number, Name, Timestamp, Status, Score, Interests, Budget, Notes

The sheets will be automatically initialized with headers on first run.

## How It Works

1. **User sends WhatsApp message** → Your webhook receives it
2. **System processes**:
   - Saves/updates user info
   - Gets conversation history
   - Sends message to Gemini AI
   - Detects buying intent
   - Calculates lead score
   - Saves conversation
3. **AI responds** → Sent back to user via WhatsApp

## Lead Qualification

**Automatic Detection:**
- Buying keywords: price, cost, buy, order, available, delivery, payment
- Lead score: 0-100 based on engagement and intent
- Status: browsing → interested → ready_to_buy

**When to check leads:**
- Open your Google Sheet to see all data in real-time
- Score 60+ = hot leads (ready to buy)
- Score 40-60 = warm leads (interested)
- Score <40 = cold leads (browsing)

## Testing

Send a test message to your WhatsApp number:
1. "Hi" → Should get friendly response
2. "How much does it cost?" → Should trigger buying intent detection
3. Check console logs for lead qualification

## Customization

**Change AI personality**: Edit `SYSTEM_INSTRUCTION` in `geminiService.js`

**Add more buying keywords**: Edit `buyingKeywords` array in `geminiService.js`

**Adjust lead scoring**: Modify `calculateLeadScore()` in `geminiService.js`

## Troubleshooting

**Webhook verification fails:**
- Check `WHATSAPP_VERIFY_TOKEN` matches in both .env and Facebook
- Ensure server is running and accessible

**No AI responses:**
- Verify `GEMINI_API_KEY` is correct
- Check console for error messages
- Ensure Gemini API has available quota

**Messages not sending:**
- Verify `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID`
- Check WhatsApp Business API credit/status
- Look at console logs for errors

## Next Steps

Once working, you can add:
- Product catalog integration
- Appointment booking
- Email/SMS notifications for hot leads
- Admin dashboard
- Automated follow-ups
- Multi-language support
