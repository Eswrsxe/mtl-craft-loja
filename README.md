# MTL CRAFT — Site

Next.js (Pages Router). Loja, login (Discord OAuth2 + Passkey/WebAuthn),
pedidos e a API que avisa o bot quando um pedido é criado.

Projeto **independente** — não depende de nenhuma pasta externa nem do
projeto do bot. Usa Prisma próprio, apontando para o mesmo `DATABASE_URL`
do bot.

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha os valores
npm run db:deploy      # aplica as migrations existentes no banco
npm run db:seed        # popula o catálogo (opcional, idempotente)
npm run dev
```

## Deploy na Vercel

1. Suba este projeto (pasta `mtl-craft-site/`, sozinha) para um repositório.
2. Importe o repositório na Vercel.
3. Configure as variáveis de `.env.example` no painel da Vercel.
4. O build já roda `prisma generate` automaticamente (`postinstall`).
5. Rode `npm run db:deploy` uma vez (localmente ou via CI) para aplicar as
   migrations no banco de produção — a Vercel não faz isso sozinha.

## Variáveis de ambiente

Veja `.env.example`. `BOT_API_URL` + `BOT_API_SECRET` apontam para o bot
(projeto `mtl-craft-bot`) — o mesmo segredo precisa estar configurado lá
como `INTERNAL_API_SECRET`.
