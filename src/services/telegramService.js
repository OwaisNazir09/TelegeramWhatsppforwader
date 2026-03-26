const { Telegraf } = require('telegraf');

class TelegramService {
    constructor() {
        this.bot = null;
    }

    async initialize(token) {
        if (!token || token === 'your_telegram_bot_token_here') {
            console.error('ERROR: TELEGRAM_BOT_TOKEN is not configured in .env');
            return false;
        }

        this.bot = new Telegraf(token);

        this.bot.catch((err, ctx) => {
            console.error(`Telegram Bot Error for ${ctx.updateType}:`, err);
        });

        console.log('Telegram bot initializing...');
        return true;
    }

    async setupListeners(targetGroupId, onMessageReceived) {
        if (!this.bot) {
            console.error('Telegram bot not initialized.');
            return;
        }

        // Handle text messages
        this.bot.on('text', async (ctx) => {
            const chatId = ctx.chat.id.toString();
            const messageText = ctx.message.text;
            const senderName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');

            // Log all received messages for debugging
            console.log(`[Telegram Debug] Message from ${chatId} (${senderName}): ${messageText}`);

            // Only forward messages from the specified group
            if (chatId === targetGroupId) {
                console.log(`Matching Group Found: ${targetGroupId}. Forwarding...`);
                await onMessageReceived(senderName, messageText);
            } else {
                console.log(`Ignoring message from chat ${chatId}. Expecting group ${targetGroupId}.`);
                
                // Help user find their group ID
                if (messageText.toLowerCase() === '/id') {
                    ctx.reply(`Current chat ID is: ${chatId}`);
                }
            }
        });

        // Launch the bot
        this.bot.launch().then(() => {
            console.log('Telegram bot is online and listening.');
        }).catch(err => {
            console.error('Failed to launch Telegram bot:', err);
        });

        // Enable graceful stop
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}

module.exports = new TelegramService();
