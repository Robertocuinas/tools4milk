FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit

FROM node:24-alpine AS builder

WORKDIR /app

# docker-compose.yml overrides this with "" so the frontend uses same-origin
# requests through Nginx. For direct deployments, pass the public backend URL.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Auditoria post-implementacion (hallazgo 5.1): controla si el login muestra
# el panel de "Accesos de prueba" con credenciales demo visibles en el
# bundle del cliente. Debe ser "production" en cualquier despliegue real
# (Azure); el valor por defecto aqui es solo para builds locales sueltas.
ARG NEXT_PUBLIC_ENVIRONMENT=development
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# output: 'standalone' NO incluye public/: sin esta copia, los assets de marca
# (/brand/logo-*.png) y el manifest devuelven 404 en produccion y el logo
# aparece roto (tambien falla /_next/image, que lee el original desde public/).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => { if (r.statusCode >= 400) process.exit(1) }).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
