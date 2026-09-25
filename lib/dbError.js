// Mensagem de erro amigável quando uma tabela/coluna nova (ex.: AdminGrant)
// ainda não existe no banco porque a migration não foi aplicada em
// produção. Usado nas rotas de convite de admin pra não travar sem
// explicação quando isso acontece.
function describeDbError(e, migrationHint) {
  const missingTable = e?.code === "P2021" || e?.code === "P2022" || /does not exist/i.test(String(e?.message));
  if (missingTable) {
    return `Tabela/coluna ainda não existe no banco. Confira se a migration ${migrationHint} foi aplicada (rode \`npx prisma migrate deploy\` ou reveja o log de build).`;
  }
  return "Erro ao consultar o banco. Tenta de novo em instantes.";
}

module.exports = { describeDbError };