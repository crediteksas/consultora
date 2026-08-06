if (process.env.KORA_PRODUCTION_PIPELINE !== 'authorized') {
  console.error('Despliegue directo bloqueado. Usa únicamente: npm run deploy:kora:production');
  process.exit(1);
}
