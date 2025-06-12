#!/usr/bin/env node

require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const chalk = require('chalk');
const { RaydiumAPI } = require('./raydium');

async function watchLiquidity() {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpc, 'confirmed');

  // Используем приватный ключ из .env если он есть, иначе генерируем временный
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  let keypair;
  if (privateKey) {
    try {
      const bytes = bs58.decode(privateKey);
      keypair = Keypair.fromSecretKey(bytes);
    } catch (err) {
      console.log(chalk.red('Неверный формат приватного ключа, генерируем случайный.'));
      keypair = Keypair.generate();
    }
  } else {
    keypair = Keypair.generate();
  }

  const raydium = new RaydiumAPI(connection);
  await raydium.initializeRaydium(keypair);

  let knownPools = await raydium.getAllPools();
  const knownAddresses = new Set(knownPools.map(p => p.address.toString()));
  console.log(chalk.green(`Старт мониторинга. Известно пулов: ${knownAddresses.size}`));

  while (true) {
    try {
      const currentPools = await raydium.getAllPools();
      const newPools = currentPools.filter(p => !knownAddresses.has(p.address.toString()));
      if (newPools.length > 0) {
        for (const pool of newPools) {
          console.log(chalk.bold.yellow('Обнаружен новый пул!'));
          console.log(`Токен: ${pool.tokenMint.toString()} | Ликвидность: ${pool.liquidity} SOL`);
          knownAddresses.add(pool.address.toString());
        }
      }
    } catch (err) {
      console.log(chalk.red(`Ошибка при получении пулов: ${err.message}`));
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

watchLiquidity().catch(err => console.error(err));
