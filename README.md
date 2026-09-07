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

## Continuação — cupons, fidelidade e recompra

Esta versão adiciona:

- Navbar compacta em estilo dashboard: no topo ficam apenas menu, carrinho e conta; logo e navegação completa ficam dentro do menu.
- Cupom de desconto com percentual ou valor fixo, início/fim, limite de usos e consumo protegido por transação.
- Pontos de fidelidade: 10 pontos valem R$ 1,00. O checkout permite usar pontos junto com cupom, mantendo no mínimo R$ 1,00 a pagar.
- `Order.pointsEarned` registra quantos pontos devem ser creditados quando o pedido for efetivamente entregue pelo bot.
- Histórico de pedidos com `Comprar de novo`, que recompõe o carrinho usando os produtos ainda disponíveis.

### Banco de dados

A migration `20260907010000_add_coupons_points` cria `Coupon`, adiciona `User.points` e os campos de desconto/pontos em `Order`. Em produção, aplique com:

```bash
npm run db:deploy
```

### Criando cupons

Os cupons podem ser criados pelo Prisma Studio ou por SQL. Exemplos de regras:

- percentual: `type = PERCENT`, `value = 10` para 10%;
- valor fixo: `type = FIXED`, `value = 5` para R$ 5,00;
- `maxUses` pode ficar nulo para uso ilimitado;
- `startsAt`/`expiresAt` podem ficar nulos para não limitar por data;
- `code` é sempre tratado em maiúsculas.

O endpoint público de checkout é `POST /api/coupons/validate`. A criação/gestão de cupons continua administrativa e não foi exposta ao cliente.

### Bot

Este ZIP contém somente o site. O crédito efetivo dos pontos acontece no fluxo de entrega do bot, usando `Order.pointsEarned`; não foi criado código de bot aqui porque o projeto do bot não veio neste ZIP.