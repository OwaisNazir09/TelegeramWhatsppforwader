const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

class WhatsAppService {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                handleSIGINT: false,
                executablePath: process.env.CHROME_PATH || undefined, // Useful for Render
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            }
        });

        this.isReady = false;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.client.on('qr', (qr) => {
                console.log('--- WHATSAPP QR CODE ---');
                qrcode.generate(qr, { small: true });
                console.log('Scan the QR code above to login to WhatsApp.');
            });

            this.client.on('ready', () => {
                console.log('WhatsApp client is ready!');
                this.isReady = true;
                resolve();
            });

            this.client.on('auth_failure', (msg) => {
                console.error('WhatsApp authentication failure:', msg);
                // Don't reject, let the user try again
            });

            this.client.on('disconnected', (reason) => {
                console.log('WhatsApp client was disconnected:', reason);
                this.isReady = false;
                // Auto-reconnect logic could go here, but usually, a restart is safer
            });

            this.client.initialize().catch(err => {
                console.error('Failed to initialize WhatsApp client:', err);
                reject(err);
            });
        });
    }

    async findGroupByName(groupName) {
        try {
            const chats = await this.client.getChats();
            const group = chats.find(chat => chat.isGroup && chat.name === groupName);
            return group;
        } catch (error) {
            console.error('Error finding WhatsApp group:', error);
            return null;
        }
    }

    async sendMessage(group, context, retries = 1) {
        const { text, mediaPath, caption } = context;
        try {
            if (!this.isReady) throw new Error('WhatsApp client not ready');

            if (mediaPath) {
                const media = MessageMedia.fromFilePath(mediaPath);
                await group.sendMessage(media, { caption: caption || text });
            } else {
                await group.sendMessage(text);
            }
            return true;
        } catch (error) {
            console.error(`Error sending to WhatsApp (Attempt ${2 - retries}):`, error.message);
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 2000));
                return this.sendMessage(group, context, retries - 1);
            }
            return false;
        }
    }
}

module.exports = new WhatsAppService();
