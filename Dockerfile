FROM node:20-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production SERVE_WEB=true PORT=4000
COPY --from=build /app /app
EXPOSE 4000
CMD ["npm", "start"]
