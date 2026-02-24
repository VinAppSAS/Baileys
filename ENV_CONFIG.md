# Configuración de Entorno

Este proyecto ahora usa variables de entorno para configurar el modo de ejecución.

## Archivos de configuración

- `.env` - Variables de entorno (no se versiona en git)
- `.env.example` - Plantilla de ejemplo para las variables de entorno

## Configuración para desarrollo local

Copia el archivo `.env.example` a `.env` y configura:

```bash
NODE_ENV=local
PORT=3000
```

En modo `local`, el servidor NO requerirá certificados SSL y ejecutará en HTTP simple.

## Configuración para producción

Para producción, configura las siguientes variables en `.env`:

```bash
NODE_ENV=production
PORT=3001
SSL_KEY_PATH=./privkey.pem
SSL_CERT_PATH=./cert.pem
```

En modo `production`, el servidor requerirá certificados SSL y ejecutará en HTTPS.

## Ejecución

```bash
# Desarrollo
node lib/app_baileys.js

# Producción (asegúrate de tener los certificados SSL)
NODE_ENV=production node lib/app_baileys.js
```
