# Telegram to WhatsApp Forwarder (User Account)

Automatically forward messages from any Telegram source (channel or group) to a WhatsApp group using your own Telegram user account.

## Features
- **User Account Integration:** Uses `gramjs` to connect as a real user (not a bot).
- **Session Persistence:** Login once with OTP; your session is saved locally in `session.txt`.
- **WhatsApp Integration:** Uses `whatsapp-web.js` for reliable messaging.
- **De-duplication:** Prevents multiple forwards of the same message.
- **Spam Control:** Randomized 1-2 second delay between messages.
- **Modular Code:** Easy to maintain and extend.

## Prerequisites
- Node.js (v16+)
- **Telegram API Credentials:** You must get these from [my.telegram.org](https://my.telegram.org):
  1. Log in with your phone number.
  2. Go to "API development tools".
  3. Create a new application (use any name).
  4. Save the `App api_id` and `App api_hash`.

## Installation

1.  **Clone/Extract** the project files.
2.  **Install dependencies**:
    ```bash
    npm install
    ```

## Configuration

### 1. Environment Variables (`.env`)
Create/Edit the `.env` file in the root directory:
```env
TELEGRAM_API_ID=your_api_id_from_telegram
TELEGRAM_API_HASH=your_api_hash_from_telegram
```

### 2. Application Config (`config.json`)
Edit the `config.json` file:
```json
{
  "TELEGRAM_SOURCE": "telegram_channel_username_or_id",
  "WHATSAPP_GROUP_NAME": "Exact WhatsApp Group Name"
}
```
*Note: `TELEGRAM_SOURCE` can be a username (e.g., `telegramnews`) or a numeric ID (e.g., `-100123456789`).*

## Running the App

1.  **Start the application**:
    ```bash
    npm start
    ```

2.  **Initial Setup (First Time Only)**:
    - **Telegram Login**:
      - Enter your phone number (e.g., `+1234567890`).
      - Enter the OTP code received in your Telegram app.
      - (Optional) Enter your 2FA password if enabled.
    - **WhatsApp Login**:
      - Scan the QR code that appears in the terminal using your WhatsApp mobile app (Linked Devices).

3.  **Success**: Once "WhatsApp client is ready!" and "Telegram client is online" appear, the app will monitor the source and forward messages.

## Error Handling
- **Disconnection**: The app handles connection retries for Telegram.
- **WhatsApp Failure**: If a message fails to send to WhatsApp, it will retry once automatically.
- **Session**: If you want to log in with a different account, delete the `session.txt` file.

## Disclaimer
This tool is for personal use and automation. Use it responsibly and respect Telegram/WhatsApp terms of service to avoid account restrictions.
