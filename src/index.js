require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const telegramService = require('./services/telegramService');
const whatsappService = require('./services/whatsappService');

// App Config
const configPath = path.join(__dirname, '..', 'config.json');
let config;
try {
    config = fs.readJsonSync(configPath);
} catch (error) {
    console.error('Error: Could not load config.json');
    process.exit(1);
}

const { TELEGRAM_SOURCES, WHATSAPP_GROUP_NAME } = config;
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Simple Queue System
class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    push(task) {
        this.queue.push(task);
        this.process();
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const task = this.queue.shift();
        try {
            await task();
        } catch (err) {
            console.error('Task execution error:', err.message);
        } finally {
            // Delay between messages (1-2 seconds)
            const delay = Math.floor(Math.random() * 1000) + 1000;
            setTimeout(() => {
                this.processing = false;
                this.process();
            }, delay);
        }
    }
}

const queue = new MessageQueue();

async function main() {
    console.log('--- Production Telegram to WhatsApp Forwarder ---');
    
    // Ensure temp dir exists
    await fs.ensureDir(TEMP_DIR);

    try {
        // Init WhatsApp
        await whatsappService.initialize();
        const targetGroup = await whatsappService.findGroupByName(WHATSAPP_GROUP_NAME);
        if (!targetGroup) {
            console.error(`ERROR: WhatsApp Group "${WHATSAPP_GROUP_NAME}" not found.`);
            process.exit(1);
        }

        // Init Telegram
        const telegramOk = await telegramService.initialize(
            process.env.TELEGRAM_API_ID,
            process.env.TELEGRAM_API_HASH
        );
        if (!telegramOk) process.exit(1);

        // Bridge Logic
        await telegramService.setupListeners(TELEGRAM_SOURCES, async (msgData) => {
            const { senderName, text, mediaPath, id } = msgData;

            queue.push(async () => {
                console.log(`[Queue] Processing message ${id} from ${senderName}...`);
                
                const caption = `[Telegram News]\nSender: ${senderName}\n\n${text}`;
                
                try {
                    const success = await whatsappService.sendMessage(targetGroup, {
                        text: caption,
                        mediaPath: mediaPath,
                        caption: caption
                    });

                    if (success) {
                        console.log(`[Forwarder] Success: Forwarded message ${id}`);
                    } else {
                        console.error(`[Forwarder] Failure: Could not forward message ${id}`);
                    }
                } finally {
                    // Always clean up media files
                    if (mediaPath && fs.existsSync(mediaPath)) {
                        await fs.remove(mediaPath);
                        console.log(`[Forwarder] Cleaned up temp file: ${path.basename(mediaPath)}`);
                    }
                }
            });
        });

        console.log('\nForwarder is active and running.');
    } catch (err) {
        console.error('Initialization Error:', err.message);
        process.exit(1);
    }
}

main();
