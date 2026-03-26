const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const fs = require('fs-extra');
const path = require('path');

class TelegramService {
    constructor() {
        this.client = null;
        this.sessionFilePath = path.join(__dirname, '..', '..', 'session.txt');
        this.tempDir = path.join(__dirname, '..', '..', 'temp');
        this.lastMessageId = null;
    }

    async initialize(apiId, apiHash) {
        if (!apiId || !apiHash) {
            console.error('ERROR: TELEGRAM_API_ID or TELEGRAM_API_HASH is missing.');
            return false;
        }

        let sessionString = '';
        if (fs.existsSync(this.sessionFilePath)) {
            sessionString = fs.readFileSync(this.sessionFilePath, 'utf8');
        }

        const stringSession = new StringSession(sessionString);
        
        // Use connectionRetries and port 443 for better stability
        this.client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
            connectionRetries: 10,
            useWSS: true, // Use port 443 fallback if port 80 is blocked
        });

        console.log('Telegram client connecting...');
        
        await this.client.start({
            phoneNumber: async () => await input.text('Phone number (+country_code): '),
            password: async () => await input.text('2FA Password (if any): '),
            phoneCode: async () => await input.text('OTP Code: '),
            onError: (err) => console.log('Telegram Login Error:', err.message),
        });

        const newSession = this.client.session.save();
        fs.writeFileSync(this.sessionFilePath, newSession, 'utf8');
        console.log('Telegram session authenticated.');
        return true;
    }

    async setupListeners(sources, onMessageReceived) {
        if (!this.client) return;

        // Clean up source input (handle URLs, usernames, IDs)
        const cleanedSources = sources.map(s => {
            if (typeof s === 'string' && s.includes('t.me/')) {
                return s.split('t.me/').pop().split('/')[0];
            }
            return s;
        });

        console.log(`Monitoring Telegram sources: ${cleanedSources.join(', ')}`);

        this.client.addEventHandler(async (event) => {
            const message = event.message;
            if (this.lastMessageId === message.id) return;
            this.lastMessageId = message.id;

            try {
                const sender = await message.getSender();
                const senderName = sender ? (sender.firstName || sender.username || 'System') : 'Unknown';
                
                let mediaPath = null;
                if (message.media) {
                    const fileName = `media_${message.id}_${Date.now()}`;
                    mediaPath = path.join(this.tempDir, fileName);
                    
                    console.log(`[Telegram] Downloading media for message ${message.id}...`);
                    const buffer = await this.client.downloadMedia(message.media, {});
                    
                    if (buffer) {
                        // Guess extension if possible, or just use binary
                        await fs.writeFile(mediaPath, buffer);
                    } else {
                        mediaPath = null;
                    }
                }

                await onMessageReceived({
                    id: message.id,
                    senderName,
                    text: message.message || '',
                    mediaPath
                });
            } catch (err) {
                console.error('Error handling Telegram message:', err.message);
            }
        }, new NewMessage({ chats: cleanedSources }));
    }

    async stop() {
        if (this.client) await this.client.disconnect();
    }
}

module.exports = new TelegramService();
