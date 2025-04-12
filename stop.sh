#!/bin/bash

echo -e "\n🛑 \033[1;31mCerrando servidor...\033[0m"

pkill -f "nodemon server.js"

echo -e "✅ \033[1;31mServidor detenido\033[0m\n"
