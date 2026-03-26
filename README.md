# Telegram to WhatsApp Forwarder

A Node.js application that automatically forwards messages from a specific Telegram group to a designated WhatsApp group.

## Features
- **Telegram Integration:** Listens for text messages in a specific group.
- **WhatsApp Integration:** Sends messages to a target group using `whatsapp-web.js`.
- **Sender Identification:** Includes the Telegram sender's name in the WhatsApp message.
- **Spam Prevention:** Adds a 1-2 second random delay between forwards.
- **Modular Design:** Separate services for Telegram and WhatsApp.
- **Configuration:** Uses `.env` for secrets and `config.json` for IDs/Names.

## Requirements
- Node.js (v16 or higher)
- A Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- WhatsApp account for QR code login

## Setup Instructions

### 1. Telegram Bot Setup
1. Message [@BotFather](https://t.me/botfather) and create a new bot.
2. Save the **API Token**.
3. Add the bot to your Telegram group.
4. **IMPORTANT:** Give the bot "Admin" rights or disable "Bot Privacy Mode" via BotFather (/setprivacy -> Disable) so it can read group messages.
5. Get your **Telegram Group ID**:
   - You can send `/id` to the bot in the group once the app is running (it will log the ID to the console).

### 2. Installation
1. Clone or download this repository.
2. Open a terminal in the project folder.
3. Install dependencies:
   ```bash
   npm install
   ```

### 3. Configuration
1. Rename/edit the `.env` file and add your Telegram token:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCDefghIJKLmnopQRSTuvwxYZ
   ```
2. Edit `config.json` with your group details:
   ```json
   {
     "TELEGRAM_GROUP_ID": "-1001234567890",
     "WHATSAPP_GROUP_NAME": "My WhatsApp Group Name"
   }
   ```
   *Note: Ensure the WhatsApp group name matches exactly.*

### 4. Running the App
1. Start the application:
   ```bash
   node src/index.js
   ```
2. A **QR Code** will appear in the terminal. Scan it with your WhatsApp mobile app (Linked Devices).
3. Once "WhatsApp client is ready!" appears, the bot will start forwarding messages.

## Debugging & Error Handling
- **Group ID:** If you don't know your Telegram Group ID, send anything in the group. The console will log `Ignoring message from chat ...`. That "..." is your group ID.
- **WhatsApp Ready:** If the "WhatsApp Group Found!" message doesn't appear, ensure you are a member of the group and the name matches exactly.
- **Retry:** If the connection drops, the app will log the disconnection. You may need to restart the app to re-initialize.

## Disclaimer
This project uses `whatsapp-web.js`, which is an unofficial library. Use it responsibly to avoid account bans. Avoid forwarding excessive messages in a short period.
