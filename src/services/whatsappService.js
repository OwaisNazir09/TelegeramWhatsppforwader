const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.latestQrDataUrl = null;
        this.initializing = false;
    }

    _createClient() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                handleSIGINT: false,
                executablePath: process.env.CHROME_PATH || undefined,
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
    }

    async initialize() {
        if (this.initializing || this.isReady) return;
        this.initializing = true;
        this.latestQrDataUrl = null;

        this._createClient();

        this.client.on('qr', async (qr) => {
            console.log('[WhatsApp] New QR code generated');
            try {
                this.latestQrDataUrl = await qrcode.toDataURL(qr, {
                    width: 280,
                    margin: 2,
                    color: { dark: '#000000', light: '#ffffff' }
                });
            } catch (err) {
                console.error('[WhatsApp] QR generation error:', err.message);
            }
        });

        this.client.on('ready', () => {
            console.log('[WhatsApp] Client is ready!');
            this.isReady = true;
            this.latestQrDataUrl = null;
            this.initializing = false;
        });

        this.client.on('auth_failure', (msg) => {
            console.error('[WhatsApp] Authentication failure:', msg);
        });

        this.client.on('disconnected', (reason) => {
            console.log('[WhatsApp] Disconnected:', reason);
            this.isReady = false;
            this.initializing = false;
        });

        try {
            await this.client.initialize();
        } catch (err) {
            console.error('[WhatsApp] Failed to initialize:', err.message);
            this.initializing = false;
            throw err;
        }
    }

    async findGroupByName(groupName) {
        try {
            const chats = await this.client.getChats();
            const group = chats.find(chat => chat.isGroup && chat.name === groupName);
            return group;
        } catch (error) {
            console.error('[WhatsApp] Error finding group:', error);
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
            console.error(`[WhatsApp] Send error (Attempt ${2 - retries}):`, error.message);
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 2000));
                return this.sendMessage(group, context, retries - 1);
            }
            return false;
        }
    }
}

module.exports = new WhatsAppService();
