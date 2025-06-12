#!/usr/bin/env node

// Загружаем переменные окружения
require('dotenv').config();

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { SniperBot } = require('./sniper');
const { loadConfig, saveConfig } = require('./config');
const { fastSnipe } = require('./sniper-functions');

// Версия программы
program.version('1.0.0');

// Загрузка конфигурации
const CONFIG_PATH = path.join(process.cwd(), 'solsniper-config.json');
let config = loadConfig(CONFIG_PATH);

// Инициализация и настройка бота
program
  .command('init')
  .description('Инициализация снайпер-бота')
  .action(async () => {
    console.log(chalk.bold.yellow('🚀 Инициализация Solana Sniper Bot'));
    
    // Проверяем наличие ключа в переменных окружения
    let privateKey = process.env.SOLANA_PRIVATE_KEY;
    
    if (!privateKey) {
      console.log(chalk.yellow('\n⚠️  ВНИМАНИЕ: Никогда не сохраняйте приватный ключ в конфигурационных файлах!'));
      console.log(chalk.yellow('Рекомендуется использовать .env файл для хранения ключа.\n'));
      
      const keyAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'privateKey',
          message: 'Введите приватный ключ вашего Solana кошелька (в base58):',
          validate: (value) => value.length > 0 ? true : 'Пожалуйста, введите приватный ключ'
        }
      ]);
      
      privateKey = keyAnswer.privateKey;
      
      // Сохраняем ключ в .env файл
      const envContent = `# Solana wallet private key\nSOLANA_PRIVATE_KEY=${privateKey}\n`;
      fs.writeFileSync('.env', envContent, { mode: 0o600 });
      console.log(chalk.green('✓ Приватный ключ сохранен в .env файл'));
    }
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'network',
        message: 'Выберите сеть Solana:',
        choices: ['mainnet-beta', 'devnet', 'testnet'],
        default: 'mainnet-beta'
      },
      {
        type: 'input',
        name: 'rpcUrl',
        message: 'Введите URL RPC-ноды (оставьте пустым для использования публичной ноды):',
        default: ''
      }
    ]);
    
    let rpcUrl;
    if (answers.rpcUrl) {
      rpcUrl = answers.rpcUrl;
    } else {
      switch(answers.network) {
        case 'mainnet-beta':
          rpcUrl = 'https://api.mainnet-beta.solana.com';
          break;
        case 'devnet':
          rpcUrl = 'https://api.devnet.solana.com';
          break;
        case 'testnet':
          rpcUrl = 'https://api.testnet.solana.com';
          break;
      }
    }
    
    // Проверка подключения к сети Solana
    console.log(chalk.blue('Проверка подключения к сети Solana...'));
    const spinner = ora('Подключение к сети').start();
    
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const version = await connection.getVersion();
      spinner.succeed(`Подключено к Solana v${version['solana-core']}`);
      
      // Проверка валидности приватного ключа
      try {
        const privateKeyBytes = bs58.decode(privateKey);
        const keypair = Keypair.fromSecretKey(privateKeyBytes);
        const publicKey = keypair.publicKey.toString();
        
        console.log(chalk.green(`Кошелек успешно импортирован: ${publicKey.slice(0, 6)}...${publicKey.slice(-6)}`));
        
        // Сохранение настроек (без приватного ключа!)
        config = {
          ...config,
          network: answers.network,
          rpcUrl: rpcUrl
        };
        
        saveConfig(CONFIG_PATH, config);
        console.log(chalk.green('✅ Конфигурация сохранена!'));
        console.log(chalk.blue('Теперь настройте параметры бота с помощью команды "config"'));
      } catch (err) {
        spinner.fail('Некорректный приватный ключ');
        console.error(chalk.red(err.message));
      }
    } catch (err) {
      spinner.fail('Не удалось подключиться к сети Solana');
      console.error(chalk.red(err.message));
    }
  });

// Настройка параметров бота
program
  .command('config')
  .description('Настройка параметров бота')
  .action(async () => {
    console.log(chalk.bold.yellow('⚙️ Настройка параметров Solana Sniper Bot'));
    
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ Приватный ключ не найден. Сначала выполните команду "init" или создайте .env файл'));
      return;
    }
    
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'maxBuyTax',
        message: 'Максимальный налог на покупку (в %):',
        default: config.maxBuyTax || 10
      },
      {
        type: 'number',
        name: 'maxSellTax',
        message: 'Максимальный налог на продажу (в %):',
        default: config.maxSellTax || 10
      },
      {
        type: 'number',
        name: 'minLiquidityInSol',
        message: 'Минимальная ликвидность (в SOL):',
        default: config.minLiquidityInSol || 2
      },
      {
        type: 'number',
        name: 'buyAmount',
        message: 'Сумма для покупки (в SOL):',
        default: config.buyAmount || 0.1
      },
      {
        type: 'number',
        name: 'autoSellAt',
        message: 'Автопродажа при достижении прибыли (в %):',
        default: config.autoSellAt || 200
      },
      {
        type: 'number',
        name: 'stopLossAt',
        message: 'Stop Loss (в %):',
        default: config.stopLossAt || 20
      },
      {
        type: 'number',
        name: 'slippage',
        message: 'Проскальзывание (в %):',
        default: config.slippage || 1
      },
      {
        type: 'confirm',
        name: 'autoBuy',
        message: 'Включить автоматическую покупку токенов?',
        default: config.autoBuy !== undefined ? config.autoBuy : false
      }
    ]);
    
    // Обновление конфигурации
    config = {
      ...config,
      ...answers
    };
    
    saveConfig(CONFIG_PATH, config);
    console.log(chalk.green('✅ Настройки сохранены!'));
  });

// Запуск бота
program
  .command('start')
  .description('Запуск снайпер-бота')
  .action(async () => {
    console.log(chalk.bold.yellow('🔥 Запуск Solana Sniper Bot'));
    
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ Приватный ключ не найден. Сначала выполните команду "init" или создайте .env файл'));
      return;
    }
    
    try {
      // Инициализация подключения к Solana
      const connection = new Connection(config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      
      // Инициализация кошелька
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      const publicKey = keypair.publicKey.toString();
      
      console.log(chalk.blue(`Используется кошелек: ${publicKey.slice(0, 6)}...${publicKey.slice(-6)}`));
      
      // Получение баланса кошелька
      const balance = await connection.getBalance(keypair.publicKey);
      console.log(chalk.blue(`Баланс кошелька: ${balance / LAMPORTS_PER_SOL} SOL`));
      
      // Создание экземпляра бота
      const bot = new SniperBot(connection, keypair, config);
      
      // Вывод информации о настройках
      console.log(chalk.cyan('Настройки бота:'));
      console.log(chalk.cyan(`✓ Макс. налог на покупку: ${config.maxBuyTax}%`));
      console.log(chalk.cyan(`✓ Макс. налог на продажу: ${config.maxSellTax}%`));
      console.log(chalk.cyan(`✓ Мин. ликвидность: ${config.minLiquidityInSol} SOL`));
      console.log(chalk.cyan(`✓ Сумма для покупки: ${config.buyAmount} SOL`));
      console.log(chalk.cyan(`✓ Автопродажа при: +${config.autoSellAt}%`));
      console.log(chalk.cyan(`✓ Stop Loss при: -${config.stopLossAt}%`));
      console.log(chalk.cyan(`✓ Проскальзывание: ${config.slippage}%`));
      console.log(chalk.cyan(`✓ Автопокупка: ${config.autoBuy ? 'Включена' : 'Выключена'}`));
      
      // Запуск бота
      console.log(chalk.green('\n🚀 Бот запущен и мониторит новые токены на Raydium...'));
      console.log(chalk.yellow('Нажмите Ctrl+C для остановки бота'));
      
      // Запуск мониторинга
      await bot.start();
      
    } catch (err) {
      console.error(chalk.red('Ошибка при запуске бота:'));
      console.error(chalk.red(err.message));
    }
  });

// Команда быстрого снайпинга новых токенов
program
  .command('snipe-new')
  .description('Быстрый снайпинг новых токенов на Raydium')
  .option('-t, --time <minutes>', 'Время мониторинга в минутах', '5')
  .option('-a, --amount <sol>', 'Сумма для покупки в SOL', config.buyAmount || '0.005')
  .option('-l, --min-liquidity <sol>', 'Минимальная ликвидность в SOL', config.minLiquidityInSol || '0.05')
  .action(async (options) => {
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('✘ Приватный ключ не найден. Сначала выполните команду "init" или создайте .env файл'));
      return;
    }
    
    try {
      const monitorTime = parseInt(options.time) * 60 * 1000; // Преобразуем минуты в миллисекунды
      const buyAmount = parseFloat(options.amount);
      const minLiquidity = parseFloat(options.minLiquidity);
      
      console.log(chalk.yellow(`🔥 Старт быстрого снайпинга на Raydium`));
      console.log(chalk.cyan(`• Время мониторинга: ${options.time} минут`));
      console.log(chalk.cyan(`• Сумма для покупки: ${buyAmount} SOL`));
      console.log(chalk.cyan(`• Мин. ликвидность: ${minLiquidity} SOL`));
      
      // Инициализация подключения к Solana
      const connection = new Connection(config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      
      // Инициализация кошелька
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      const publicKey = keypair.publicKey.toString();
      
      console.log(chalk.blue(`Используется кошелек: ${publicKey.slice(0, 6)}...${publicKey.slice(-6)}`));
      
      // Проверка баланса
      const spinner = ora('Проверка баланса').start();
      const balance = await connection.getBalance(keypair.publicKey);
      spinner.succeed(`Баланс кошелька: ${balance / LAMPORTS_PER_SOL} SOL`);
      
      if (balance < buyAmount * LAMPORTS_PER_SOL) {
        console.log(chalk.red(`✘ Недостаточно средств. Необходимо: ${buyAmount} SOL`));
        return;
      }
      
      // Создание экземпляра бота
      const bot = new SniperBot(connection, keypair, {
        ...config,
        buyAmount,
        minLiquidityInSol: minLiquidity,
        autoBuy: true // Включаем автопокупку
      });
      
      // Запускаем быстрый снайпинг
      await fastSnipe(bot, monitorTime);
      
    } catch (err) {
      console.error(chalk.red('Ошибка при снайпинге:'));
      console.error(chalk.red(err.message));
    }
  });

// Проверка токена
program
  .command('check-token <tokenAddress>')
  .description('Проверка информации о токене')
  .action(async (tokenAddress) => {
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ Приватный ключ не найден. Сначала выполните команду "init" или создайте .env файл'));
      return;
    }
    
    try {
      const spinner = ora('Проверка токена').start();
      
      // Инициализация подключения к Solana
      const connection = new Connection(config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      
      // Инициализация кошелька
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      
      // Создание экземпляра бота
      const bot = new SniperBot(connection, keypair, config);
      
      // Проверка токена
      const tokenInfo = await bot.checkToken(new PublicKey(tokenAddress));
      spinner.succeed('Токен проверен');
      
      console.log(chalk.cyan('\nИнформация о токене:'));
      console.log(chalk.cyan(`✓ Адрес: ${tokenAddress}`));
      console.log(chalk.cyan(`✓ Символ: ${tokenInfo.symbol}`));
      console.log(chalk.cyan(`✓ Название: ${tokenInfo.name}`));
      console.log(chalk.cyan(`✓ Общее предложение: ${tokenInfo.supply}`));
      console.log(chalk.cyan(`✓ Децималы: ${tokenInfo.decimals}`));
      
      if (tokenInfo.raydiumPool) {
        console.log(chalk.green('\nПул ликвидности Raydium:'));
        console.log(chalk.green(`✓ Адрес пула: ${tokenInfo.raydiumPool.address}`));
        console.log(chalk.green(`✓ Ликвидность: ${tokenInfo.raydiumPool.liquidity} SOL`));
        console.log(chalk.green(`✓ Цена: ${tokenInfo.raydiumPool.price} SOL`));
      } else {
        console.log(chalk.yellow('\nПул ликвидности Raydium не найден'));
      }
      
    } catch (err) {
      console.error(chalk.red('Ошибка при проверке токена:'));
      console.error(chalk.red(err.message));
    }
  });

// Команда покупки токена
program
  .command('buy <tokenAddress> <amountInSol>')
  .description('Покупка токена вручную')
  .action(async (tokenAddress, amountInSol) => {
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ Приватный ключ не найден. Сначала выполните команду "init" или создайте .env файл'));
      return;
    }
    
    try {
      const spinner = ora('Покупка токена').start();
      
      // Инициализация подключения к Solana
      const connection = new Connection(config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      
      // Инициализация кошелька
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      
      // Создание экземпляра бота
      const bot = new SniperBot(connection, keypair, config);
      
      // Покупка токена
      const txId = await bot.buyToken(new PublicKey(tokenAddress), parseFloat(amountInSol));
      spinner.succeed(`Токен куплен! Транзакция: ${txId}`);
      
    } catch (err) {
      console.error(chalk.red('Ошибка при покупке токена:'));
      console.error(chalk.red(err.message));
    }
  });

// Команда продажи токена
program
  .command('sell <tokenAddress> [percentage]')
  .description('Продажа токена вручную (в процентах от баланса)')
  .action(async (tokenAddress, percentage = '100') => {
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ Приватный ключ не найден. Сначала выполните команду "init" или создайте .env файл'));
      return;
    }
    
    try {
      const spinner = ora('Продажа токена').start();
      
      // Инициализация подключения к Solana
      const connection = new Connection(config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      
      // Инициализация кошелька
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      
      // Создание экземпляра бота
      const bot = new SniperBot(connection, keypair, config);
      
      // Продажа токена
      const txId = await bot.sellToken(new PublicKey(tokenAddress), parseInt(percentage));
      spinner.succeed(`Токен продан! Транзакция: ${txId}`);
      
    } catch (err) {
      console.error(chalk.red('Ошибка при продаже токена:'));
      console.error(chalk.red(err.message));
    }
  });

// Команда для просмотра портфеля токенов
program
  .command('portfolio')
  .description('Просмотр портфеля токенов')
  .action(async () => {
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      console.log(chalk.red('❌ Приватный ключ не найден. Сначала выполните команду "init" или создайте .env файл'));
      return;
    }
    
    try {
      const spinner = ora('Загрузка портфеля').start();
      
      // Инициализация подключения к Solana
      const connection = new Connection(config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      
      // Инициализация кошелька
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      
      // Создание экземпляра бота
      const bot = new SniperBot(connection, keypair, config);
      
      // Получение портфеля
      const portfolio = await bot.getPortfolio();
      spinner.succeed('Портфель загружен');
      
      console.log(chalk.cyan('\nПортфель токенов:'));
      
      if (portfolio.length === 0) {
        console.log(chalk.yellow('Портфель пуст'));
      } else {
        portfolio.forEach((token, index) => {
          console.log(chalk.cyan(`\n${index + 1}. ${token.symbol} (${token.name})`));
          console.log(chalk.cyan(`   Адрес: ${token.address}`));
          console.log(chalk.cyan(`   Баланс: ${token.balance}`));
          console.log(chalk.cyan(`   Стоимость: ~${token.valueInSol} SOL ($${token.valueInUsd})`));
        });
        
        console.log(chalk.green(`\nОбщая стоимость портфеля: ~${portfolio.reduce((total, token) => total + token.valueInSol, 0)} SOL`));
        console.log(chalk.green(`Общая стоимость в USD: ~$${portfolio.reduce((total, token) => total + token.valueInUsd, 0)}`));
      }
      
    } catch (err) {
      console.error(chalk.red('Ошибка при загрузке портфеля:'));
      console.error(chalk.red(err.message));
    }
  });

// Обработка неизвестных команд
program.on('command:*', () => {
  console.error(chalk.red(`Неизвестная команда ${program.args.join(' ')}`));
  console.log('Доступные команды: init, config, start, snipe-new, check-token, buy, sell, portfolio');
  process.exit(1);
});

// Запуск CLI
program.parse(process.argv);

// Если команда не указана, выводим помощь
if (!process.argv.slice(2).length) {
  program.outputHelp();
}