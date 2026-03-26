const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class WhatsAppService {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                handleSIGINT: false,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
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
                reject(new Error(msg));
            });

            this.client.on('disconnected', (reason) => {
                console.log('WhatsApp client was disconnected:', reason);
                this.isReady = false;
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

    async sendMessage(group, message, retries = 1) {
        try {
            if (!this.isReady) {
                console.error('WhatsApp client not ready. Cannot send message.');
                return false;
            }
            await group.sendMessage(message);
            return true;
        } catch (error) {
            console.error(`Error sending message to WhatsApp (Attempt ${2 - retries}):`, error);
            if (retries > 0) {
                console.log('Retrying to send message...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.sendMessage(group, message, retries - 1);
            }
            return false;
        }
    }
}

module.exports = new WhatsAppService();
