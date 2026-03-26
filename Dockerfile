FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Ensure data and temp directories exist
RUN mkdir -p /app/temp

CMD ["npm", "start"]
