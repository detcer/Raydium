#!/usr/bin/env node

require('dotenv').config();
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const chalk = require('chalk');
const { SniperBot } = require('./sniper');

async function analyzePools() {
  console.log(chalk.bold.yellow('🔍 Анализ пулов для поиска подходящих токенов'));
  
  try {
    // Проверяем наличие ключа
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ SOLANA_PRIVATE_KEY не найден в .env файле'));
      return;
    }
    
    // Инициализация
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const privateKeyBytes = bs58.decode(privateKey);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    // Загружаем конфигурацию
    const config = require('./solsniper-config.json');
    console.log(chalk.cyan('📊 Текущие критерии фильтрации:'));
    console.log(chalk.cyan(`- Мин. ликвидность: ${config.minLiquidityInSol} SOL`));
    console.log(chalk.cyan(`- Макс. налог покупки: ${config.maxBuyTax}%`));
    console.log(chalk.cyan(`- Макс. налог продажи: ${config.maxSellTax}%`));
    
    // Создаем бота
    const bot = new SniperBot(connection, keypair, config);
    await bot.raydium.initializeRaydium(keypair);
    
    // Получаем все пулы
    console.log(chalk.cyan('\n🔄 Загрузка пулов...'));
    const pools = await bot.raydium.getAllPools();
    console.log(chalk.green(`✅ Загружено ${pools.length} пулов`));
    
    // Анализируем первые 20 пулов
    console.log(chalk.cyan('\n🧪 Анализ пулов на соответствие критериям:'));
    
    let suitableCount = 0;
    let checkedCount = 0;
    
    for (let i = 0; i < Math.min(pools.length, 20); i++) {
      const pool = pools[i];
      checkedCount++;
      
      try {
        console.log(chalk.blue(`\n--- Пул ${i + 1}/${Math.min(pools.length, 20)} ---`));
        console.log(`Токен: ${pool.tokenMint.toString()}`);
        console.log(`Ликвидность: ${pool.liquidity.toFixed(6)} SOL`);
        console.log(`Цена: ${pool.price} SOL`);
        console.log(`Объем 24ч: ${pool.volume24h}`);
        
        // Получаем информацию о токене
        const tokenInfo = await bot.raydium.getTokenInfo(pool.tokenMint);
        console.log(`Символ: ${tokenInfo.symbol}`);
        console.log(`Название: ${tokenInfo.name}`);
        
        // Проверяем критерии
        let suitable = true;
        let reasons = [];
        
        if (pool.liquidity < config.minLiquidityInSol) {
          suitable = false;
          reasons.push(`❌ Недостаточная ликвидность (${pool.liquidity.toFixed(6)} < ${config.minLiquidityInSol})`);
        } else {
          reasons.push(`✅ Ликвидность достаточна`);
        }
        
        // Оценка налогов
        const buyTax = await bot.estimateBuyTax(pool);
        const sellTax = await bot.estimateSellTax(pool);
        
        if (buyTax > config.maxBuyTax) {
          suitable = false;
          reasons.push(`❌ Высокий налог покупки (${buyTax}% > ${config.maxBuyTax}%)`);
        } else {
          reasons.push(`✅ Налог покупки приемлем (${buyTax}%)`);
        }
        
        if (sellTax > config.maxSellTax) {
          suitable = false;
          reasons.push(`❌ Высокий налог продажи (${sellTax}% > ${config.maxSellTax}%)`);
        } else {
          reasons.push(`✅ Налог продажи приемлем (${sellTax}%)`);
        }
        
        // Выводим результат
        reasons.forEach(reason => console.log(reason));
        
        if (suitable) {
          suitableCount++;
          console.log(chalk.green('🎯 ПОДХОДЯЩИЙ ТОКЕН!'));
          
          if (config.autoBuy) {
            console.log(chalk.yellow('💡 Этот токен был бы куплен ботом!'));
          }
        } else {
          console.log(chalk.red('❌ Токен не подходит'));
        }
        
      } catch (err) {
        console.log(chalk.red(`Ошибка при анализе: ${err.message}`));
      }
    }
    
    console.log(chalk.bold.cyan(`\n📊 РЕЗУЛЬТАТЫ АНАЛИЗА:`));
    console.log(chalk.cyan(`Проверено пулов: ${checkedCount}`));
    console.log(chalk.green(`Подходящих токенов: ${suitableCount}`));
    console.log(chalk.yellow(`Процент подходящих: ${((suitableCount / checkedCount) * 100).toFixed(1)}%`));
    
    if (suitableCount === 0) {
      console.log(chalk.red('\n❌ НЕ НАЙДЕНО ПОДХОДЯЩИХ ТОКЕНОВ'));
      console.log(chalk.yellow('💡 Рекомендации:'));
      console.log(chalk.yellow(`- Снизить минимальную ликвидность (сейчас ${config.minLiquidityInSol} SOL)`));
      console.log(chalk.yellow(`- Увеличить максимальные налоги (сейчас ${config.maxBuyTax}%/${config.maxSellTax}%)`));
      console.log(chalk.yellow('- Дождаться появления новых пулов'));
    } else {
      console.log(chalk.green('\n✅ НАЙДЕНЫ ПОДХОДЯЩИЕ ТОКЕНЫ'));
      console.log(chalk.cyan('Бот должен их покупать при появлении новых пулов'));
    }
    
  } catch (err) {
    console.error(chalk.red('❌ Ошибка при анализе:'));
    console.error(chalk.red(err.message));
  }
}

// Запуск анализа
analyzePools(); 