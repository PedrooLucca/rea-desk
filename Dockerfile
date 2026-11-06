# Servidor de conexão para uso pela internet (opcional). Hospede em qualquer serviço que rode Docker
# e que forneça HTTPS (ele vira o endereço wss://...). Depois coloque esse endereço em config/defaults.json.
FROM node:22-alpine
WORKDIR /app
RUN npm install --omit=dev ws@8
COPY server/server.js ./server.js
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "server.js"]
