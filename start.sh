#!/bin/bash

echo -e "\n🚀 \033[1;32mIniciando servidor...\033[0m"

# Matar proceso anterior si está corriendo
pkill -f "nodemon server.js"

# Obtener IP pública actual
PUBLIC_IP=$(curl -s ifconfig.me)

echo "🌐 IP pública actual: $PUBLIC_IP"
echo "⚠️ Recuerda pegarla en Unity si no es una IP fija"

# Iniciar backend (API Unity)
nohup node server.js > log_unity.txt 2>&1 &
echo "🔌 API Unity     -> http://localhost:3000 (log: log_unity.txt)"

echo -e "✅ \033[1;32mServidor iniciado correctamente\033[0m\n"

