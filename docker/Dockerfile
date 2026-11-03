FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN npm install
RUN npm run build

FROM node:22-alpine
ARG APP
ENV NODE_ENV=production
ENV APP_NAME=${APP}
WORKDIR /app
COPY --from=build /app /app
CMD ["sh", "-lc", "npm run start -w @bom/$APP_NAME"]
