FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm i --no-save tsx
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
