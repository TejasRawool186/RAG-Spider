# Use the official Apify Node.js 20 image with Playwright
FROM apify/actor-node-playwright:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . ./

# Set the command to run the actor
CMD npm start