FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock .yarnrc .yarnrc.yml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY data ./data
RUN yarn install --non-interactive
RUN yarn build

FROM node:22-alpine
ARG APP
ENV NODE_ENV=production
ENV APP_NAME=${APP}
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
CMD ["sh", "-lc", "exec yarn workspace @bom/$APP_NAME start"]
