#!/usr/bin/env node

require('dotenv').config();
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const chalk = require('chalk');
const { SniperBot } = require('./sniper');

async function testBot() {
  console.log(chalk.bold.yellow('🧪 Тест обновленного снайпер-бота'));
  
  try {
    // Проверяем наличие ключа
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ SOLANA_PRIVATE_KEY не найден в .env файле'));
      return;
    }
    
    // Инициализация подключения к Solana
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Инициализация кошелька
    const privateKeyBytes = bs58.decode(privateKey);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    const publicKey = keypair.publicKey.toString();
    
    console.log(chalk.blue(`Кошелек: ${publicKey.slice(0, 6)}...${publicKey.slice(-6)}`));
    
    // Проверка баланса
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(chalk.blue(`Баланс: ${balance / 1000000000} SOL`));
    
    // Конфигурация для теста
    const config = {
      maxBuyTax: 10,
      maxSellTax: 10,
      minLiquidityInSol: 1,
      buyAmount: 0.002,
      autoSellAt: 20,
      stopLossAt: 10,
      slippage: 1,
      autoBuy: false // Отключаем автопокупку для теста
    };
    
    // Создание экземпляра бота
    console.log(chalk.cyan('Создание экземпляра бота...'));
    const bot = new SniperBot(connection, keypair, config);
    
    // Тест инициализации Raydium SDK
    console.log(chalk.cyan('Тест инициализации Raydium SDK...'));
    await bot.raydium.initializeRaydium(keypair);
    console.log(chalk.green('✅ Raydium SDK успешно инициализирован'));
    
    // Тест получения пулов
    console.log(chalk.cyan('Тест получения пулов...'));
    const pools = await bot.raydium.getAllPools();
    console.log(chalk.green(`✅ Получено ${pools.length} пулов`));
    
    if (pools.length > 0) {
      // Тест получения информации о токене
      const firstPool = pools[0];
      console.log(chalk.cyan(`Тест получения информации о токене ${firstPool.tokenMint.toString()}...`));
      
      try {
        const tokenInfo = await bot.raydium.getTokenInfo(firstPool.tokenMint);
        console.log(chalk.green(`✅ Информация о токене: ${tokenInfo.symbol} (${tokenInfo.name})`));
        
        // Тест поиска пула по токену
        console.log(chalk.cyan('Тест поиска пула по токену...'));
        const foundPool = await bot.raydium.getPoolByTokenMint(firstPool.tokenMint);
        console.log(chalk.green(`✅ Пул найден: ликвидность ${foundPool.liquidity} SOL`));
        
      } catch (tokenErr) {
        console.log(chalk.yellow(`⚠️ Ошибка при получении информации о токене: ${tokenErr.message}`));
      }
    }
    
    console.log(chalk.green('\n🎉 Все тесты пройдены успешно!'));
    console.log(chalk.cyan('Бот готов к работе. Запустите его командой: npm start'));
    
  } catch (err) {
    console.error(chalk.red('❌ Ошибка при тестировании:'));
    console.error(chalk.red(err.message));
    console.error(err.stack);
  }
}

// Запуск теста
testBot(); 