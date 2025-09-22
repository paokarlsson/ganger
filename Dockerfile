# 1. Byggsteget
FROM node:20-alpine AS build

WORKDIR /app

# Installera dependencies
COPY package*.json ./
RUN npm install

# Kopiera koden
COPY . .

# Bygg Angular-produktion
RUN npm run build --prod

# 2. Produktionssteget med Nginx
FROM nginx:alpine

# Kopiera byggda filer till Nginx
COPY --from=build /app/docs/ /usr/share/nginx/html

# Kopiera egen Nginx-konfiguration (valfritt)
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Exponera port
EXPOSE 80

# Starta Nginx
CMD ["nginx", "-g", "daemon off;"]