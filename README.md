# Production-Ready Telegram to WhatsApp Media Forwarder

This application forwards text and media (images, videos, documents) from multiple Telegram sources to a specific WhatsApp group.

## Features
- **Multi-Source:** Monitor multiple channels/groups.
- **Media Support:** Images, videos, and documents are automatically forwarded.
- **Queue System:** Prevents spam and respects rate limits.
- **Persistent Sessions:** Saves Telegram and WhatsApp credentials locally.
- **Self-Cleaning:** Temporary media files are deleted immediately after forwarding.
- **Stability:** Uses port 443 for Telegram connections if port 80 is blocked.

## Setup Instructions

### 1. API Credentials
Get your `API_ID` and `API_HASH` from [my.telegram.org](https://my.telegram.org).

### 2. Configuration
- **.env**:
  ```env
  TELEGRAM_API_ID=123456
  TELEGRAM_API_HASH=abcdef123456
  ```
- **config.json**:
  ```json
  {
    "TELEGRAM_SOURCES": ["username1", "-100123456789"],
    "WHATSAPP_GROUP_NAME": "Forwarded News"
  }
  ```

### 3. Installation
```bash
npm install
```

### 4. Running Locally
```bash
npm start
```
- First run: You will be prompted for your phone number, OTP, and 2FA password (for Telegram), and a QR code (for WhatsApp).
- Subsequent runs: It will use the saved `session.txt` and `.wwebjs_auth` folder.

## Deployment on Render.com

1. **Environment Variables:**
   - Set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`.
   - Set `CHROME_PATH` if needed (Render usually has it at `/usr/bin/google-chrome`).
2. **Persistence:**
   - Render has an ephemeral file system. To keep your session alive, you should either:
     - Use a Dockerfile with persistent volumes.
     - Or, first log in locally, and copy the `session.txt` and `.wwebjs_auth` content to your repository (Not recommended for public repos).
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`

## Project Structure
- `src/index.js`: Main app with message queue.
- `src/services/telegramService.js`: MTProto client with media download logic.
- `src/services/whatsappService.js`: WhatsApp client with media upload logic.
- `temp/`: Temporary storage for media files (auto-cleaned).

## Disclaimer
Use this tool responsibly. Excessive message forwarding can lead to account restrictions on Telegram or WhatsApp.
