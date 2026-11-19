# Use the official Apify Node.js image with pre-installed Playwright and Chrome
FROM apify/actor-node-playwright-chrome:20

# Copy package files with correct permissions for myuser
COPY --chown=myuser package*.json ./

# Install NPM dependencies (skip dev dependencies, keep playwright matching container)
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy remaining source code
COPY --chown=myuser . ./

# Set the command to run the actor
CMD npm start --silent
