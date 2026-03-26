require('dotenv').config();
const fs = require('fs');
const path = require('path');
const telegramService = require('./services/telegramService');
const whatsappService = require('./services/whatsappService');

// Load config
const configPath = path.join(__dirname, '..', 'config.json');
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading config.json:', error);
    process.exit(1);
}

const { TELEGRAM_GROUP_ID, WHATSAPP_GROUP_NAME } = config;

async function start() {
    console.log('--- Starting Telegram to WhatsApp Forwarder ---');

    try {
        // Initialize WhatsApp
        console.log('Initializing WhatsApp Service...');
        await whatsappService.initialize();

        // Find WhatsApp target group
        console.log(`Searching for WhatsApp Group: "${WHATSAPP_GROUP_NAME}"...`);
        const targetGroup = await whatsappService.findGroupByName(WHATSAPP_GROUP_NAME);

        if (!targetGroup) {
            console.error(`ERROR: WhatsApp Group "${WHATSAPP_GROUP_NAME}" not found.`);
            console.log('Please make sure you are a member of the group and the name is correct.');
            process.exit(1);
        }

        console.log(`WhatsApp Group Found! (ID: ${targetGroup.id._serialized})`);

        console.log('Initializing Telegram Service...');
        const telegramInitialized = await telegramService.initialize(process.env.TELEGRAM_BOT_TOKEN);

        if (!telegramInitialized) {
            process.exit(1);
        }

        await telegramService.setupListeners(TELEGRAM_GROUP_ID, async (senderName, text) => {
            const forwardText = `*[${senderName}]:* ${text}`;

            console.log(`[Forwarder] Queuing message from ${senderName}...`);

            // Add a small delay (1-2 seconds) to avoid spam detection
            const delay = Math.floor(Math.random() * 1000) + 1000;
            console.log(`[Forwarder] Waiting ${delay}ms before sending...`);

            await new Promise(resolve => setTimeout(resolve, delay));

            const success = await whatsappService.sendMessage(targetGroup, forwardText);

            if (success) {
                console.log(`[Forwarder] Message successfully sent to WhatsApp!`);
            } else {
                console.error(`[Forwarder] FAILED to send message to WhatsApp.`);
            }
        });

        console.log('Forwarder is active. Listening for messages...');
    } catch (error) {
        console.error('Critical initialization error:', error);
        process.exit(1);
    }
}

// Global error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

start();
