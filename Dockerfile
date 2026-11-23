# Production-shaped preview of the static customer dashboard.
# Build: docker build -t fonitas-self-hosted-panel .
# Run:   docker run --rm -p 4173:80 fonitas-self-hosted-panel
# Open:  http://localhost:4173

FROM node:24-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json VERSION ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
