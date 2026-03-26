const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const fs = require('fs');
const path = require('path');

class TelegramService {
    constructor() {
        this.client = null;
        this.sessionFilePath = path.join(__dirname, '..', '..', 'session.txt');
        this.lastMessageId = null;
    }

    async initialize(apiId, apiHash) {
        if (!apiId || !apiHash || apiId === 'your_api_id_here' || apiHash === 'your_api_hash_here') {
            console.error('ERROR: TELEGRAM_API_ID or TELEGRAM_API_HASH is not configured in .env');
            return false;
        }

        let sessionString = '';
        if (fs.existsSync(this.sessionFilePath)) {
            sessionString = fs.readFileSync(this.sessionFilePath, 'utf8');
        }

        const stringSession = new StringSession(sessionString);
        this.client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
            connectionRetries: 5,
        });

        console.log('Telegram client initializing...');

        await this.client.start({
            phoneNumber: async () => await input.text('Please enter your phone number (including country code): '),
            password: async () => await input.text('Please enter your password (if any): '),
            phoneCode: async () => await input.text('Please enter the OTP you received: '),
            onError: (err) => console.log('Telegram Login Error:', err),
        });

        // Save session after successful login
        const newSessionString = this.client.session.save();
        fs.writeFileSync(this.sessionFilePath, newSessionString, 'utf8');
        console.log('Telegram session saved for future use.');

        console.log('Telegram client is now online.');
        return true;
    }

    async setupListeners(sourceChat, onMessageReceived) {
        if (!this.client) {
            console.error('Telegram client not initialized.');
            return;
        }

        let source = sourceChat;
        if (source.includes('t.me/')) {
            source = source.split('t.me/').pop().split('/')[0];
            console.log(`Extracted username "${source}" from URL.`);
        }

        this.client.addEventHandler(async (event) => {
            const message = event.message;

            // Deduplication logic
            if (this.lastMessageId === message.id) return;
            this.lastMessageId = message.id;

            try {
                const sender = await message.getSender();
                const senderName = sender ? (sender.firstName || sender.username || 'Unknown Sender') : 'Anonymous';

                // Trigger callback
                await onMessageReceived(senderName, message.message, message.id);
            } catch (err) {
                console.error('Error in Telegram event handler:', err);
            }
        }, new NewMessage({ chats: [source] }));
    }

    async stop() {
        if (this.client) {
            await this.client.disconnect();
        }
    }
}

module.exports = new TelegramService();
