#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

console.log(chalk.bold.cyan(`
╔═══════════════════════════════════════╗
║     Solana Sniper Bot Quick Start     ║
╚═══════════════════════════════════════╝
`));

async function quickStart() {
  try {
    // Шаг 1: Проверка Node.js версии
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    
    if (majorVersion < 14) {
      console.log(chalk.red(`✘ Требуется Node.js версии 14 или выше. Текущая версия: ${nodeVersion}`));
      process.exit(1);
    }
    console.log(chalk.green(`✓ Node.js ${nodeVersion}`));
    
    // Шаг 2: Проверка установки зависимостей
    const spinner = ora('Проверка зависимостей...').start();
    
    if (!fs.existsSync('node_modules')) {
      spinner.text = 'Установка зависимостей...';
      execSync('npm install', { stdio: 'inherit' });
    }
    spinner.succeed('Зависимости установлены');
    
    // Шаг 3: Проверка .env файла
    if (!fs.existsSync('.env')) {
      console.log(chalk.yellow('\n⚠️  .env файл не найден'));
      
      const { createEnv } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'createEnv',
          message: 'Создать .env файл сейчас?',
          default: true
        }
      ]);
      
      if (createEnv) {
        // Копируем из примера
        if (fs.existsSync('.env.example')) {
          fs.copyFileSync('.env.example', '.env');
          console.log(chalk.green('✓ .env файл создан из примера'));
        } else {
          // Создаем базовый .env
          const envContent = `# Solana wallet private key
SOLANA_PRIVATE_KEY=

# Network configuration
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
`;
          fs.writeFileSync('.env', envContent);
          console.log(chalk.green('✓ Создан базовый .env файл'));
        }
        
        console.log(chalk.yellow('\n⚠️  Не забудьте добавить ваш приватный ключ в .env файл!'));
      }
    } else {
      console.log(chalk.green('✓ .env файл найден'));
    }
    
    // Шаг 4: Проверка безопасности
    console.log(chalk.blue('\nПроверка безопасности...'));
    try {
      execSync('node security-utils.js check', { stdio: 'inherit' });
    } catch (err) {
      // Игнорируем ошибки проверки безопасности
    }
    
    // Шаг 5: Проверка конфигурации
    if (!fs.existsSync('solsniper-config.json')) {
      console.log(chalk.yellow('\n⚠️  Конфигурация не найдена'));
      console.log(chalk.blue('Запустите "npm run init" для инициализации бота'));
    } else {
      const config = JSON.parse(fs.readFileSync('solsniper-config.json', 'utf8'));
      
      // Проверяем, что в конфиге нет приватного ключа
      if (config.privateKey) {
        console.log(chalk.red('\n✘ КРИТИЧНО: Приватный ключ найден в конфигурации!'));
        
        const { removeKey } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'removeKey',
            message: 'Удалить приватный ключ из конфигурации?',
            default: true
          }
        ]);
        
        if (removeKey) {
          delete config.privateKey;
          fs.writeFileSync('solsniper-config.json', JSON.stringify(config, null, 2));
          console.log(chalk.green('✓ Приватный ключ удален из конфигурации'));
        }
      }
    }
    
    // Шаг 6: Меню действий
    console.log(chalk.bold.green('\n✓ Все готово к работе!\n'));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Что вы хотите сделать?',
        choices: [
          { name: '🚀 Инициализировать бота', value: 'init' },
          { name: '⚙️  Настроить параметры', value: 'config' },
          { name: '🔥 Запустить бота', value: 'start' },
          { name: '🎯 Быстрый снайпинг (5 минут)', value: 'snipe' },
          { name: '💼 Просмотреть портфель', value: 'portfolio' },
          { name: '🔑 Создать новый кошелек', value: 'generate' },
          { name: '📖 Открыть документацию', value: 'docs' },
          { name: '❌ Выход', value: 'exit' }
        ]
      }
    ]);
    
    switch (action) {
      case 'init':
        execSync('npm run init', { stdio: 'inherit' });
        break;
      case 'config':
        execSync('npm run config', { stdio: 'inherit' });
        break;
      case 'start':
        execSync('npm run start', { stdio: 'inherit' });
        break;
      case 'snipe':
        execSync('npm run snipe', { stdio: 'inherit' });
        break;
      case 'portfolio':
        execSync('npm run portfolio', { stdio: 'inherit' });
        break;
      case 'generate':
        execSync('npm run generate-wallet', { stdio: 'inherit' });
        break;
      case 'docs':
        console.log(chalk.blue('\nДокументация:'));
        console.log('• README.md - Основная документация');
        console.log('• TROUBLESHOOTING.md - Устранение неполадок');
        console.log('• .env.example - Пример конфигурации окружения');
        break;
      case 'exit':
        console.log(chalk.green('\nУдачной торговли! 🚀'));
        process.exit(0);
    }
    
    // Предложить запустить снова
    const { again } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'again',
        message: '\nВернуться в меню?',
        default: true
      }
    ]);
    
    if (again) {
      console.clear();
      await quickStart();
    }
    
  } catch (err) {
    console.error(chalk.red(`\nОшибка: ${err.message}`));
    process.exit(1);
  }
}

// Запуск
quickStart();
