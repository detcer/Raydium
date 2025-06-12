const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const ora = require('ora');
const chalk = require('chalk');

/**
 * Быстрый снайпинг новых токенов на Raydium
 * @param {SniperBot} bot Экземпляр снайпер-бота
 * @param {number} timeoutMs Время мониторинга в миллисекундах
 */
async function fastSnipe(bot, timeoutMs) {
  // Получаем текущие пулы для сравнения
  const spinner = ora('Загрузка пулов Raydium').start();
  let knownPools = await bot.raydium.getAllPools();
  spinner.succeed(`Загружено ${knownPools.length} существующих пулов`);
  
  // Храним адреса пулов в сете для быстрого поиска
  const knownPoolAddresses = new Set(knownPools.map(pool => pool.address.toString()));
  console.log(chalk.blue(`Создан индекс известных пулов: ${knownPoolAddresses.size} адресов`));
  
  // Устанавливаем таймер для завершения мониторинга
  const endTime = Date.now() + timeoutMs;
  let checkCount = 0;
  let foundCount = 0;
  
  // Запускаем цикл проверки новых пулов
  bot.running = true;
  console.log(chalk.green(`🕐 Начало мониторинга новых токенов... Будет завершено в ${new Date(endTime).toLocaleTimeString()}`));
  
  let progressBar = ora({
    text: 'Мониторинг новых пулов...',
    spinner: 'dots'
  }).start();
  
  while (Date.now() < endTime && bot.running) {
    try {
      checkCount++;
      progressBar.text = `Мониторинг пулов... Проверка #${checkCount}, найдено: ${foundCount}`;
      
      // Получаем текущий список пулов
      bot.raydium.clearPoolsCache(); // Принудительно обновляем кэш каждый раз
      const currentPools = await bot.raydium.getAllPools();
      const currentPoolsCount = currentPools.length;
      
      // Находим новые пулы
      const newPools = currentPools.filter(pool => 
        !knownPoolAddresses.has(pool.address.toString())
      );
      
      // Обрабатываем новые пулы
      if (newPools.length > 0) {
        progressBar.stopAndPersist({
          symbol: '🔎',
          text: chalk.green(`Обнаружено ${newPools.length} новых пулов ликвидности из ${currentPoolsCount} всего`)
        });
        
        // Выводим информацию о новых пулах
        for (const pool of newPools) {
          foundCount++;
          try {
            // Фильтруем по минимальной ликвидности
            if (pool.liquidity < bot.config.minLiquidityInSol) {
              console.log(chalk.yellow(`✓ Пул ${pool.tokenMint.toString().slice(0, 8)}... пропущен: малая ликвидность (${pool.liquidity} SOL)`));
              continue;
            }
            
            // Проверяем пул на соответствие критериям
            const poolSpinner = ora(`Анализ пула ${pool.tokenMint.toString().slice(0, 8)}...`).start();
            
            // Получаем информацию о токене
            const tokenInfo = await bot.checkToken(pool.tokenMint);
            
            // Оценка налогов
            const buyTax = await bot.estimateBuyTax(pool);
            const sellTax = await bot.estimateSellTax(pool);
            
            if (buyTax > bot.config.maxBuyTax) {
              poolSpinner.warn(`Токен ${tokenInfo.symbol} отклонен: большой налог покупки (${buyTax}%)`);
              continue;
            }
            
            if (sellTax > bot.config.maxSellTax) {
              poolSpinner.warn(`Токен ${tokenInfo.symbol} отклонен: большой налог продажи (${sellTax}%)`);
              continue;
            }
            
            // Прошёл все проверки, выводим информацию
            poolSpinner.succeed(`Найден подходящий токен: ${tokenInfo.symbol}`);
            
            console.log(chalk.cyan(`• Токен: ${tokenInfo.symbol} (${tokenInfo.name})`));
            console.log(chalk.cyan(`• Адрес: ${pool.tokenMint.toString()}`));
            console.log(chalk.cyan(`• Ликвидность: ${pool.liquidity} SOL`));
            console.log(chalk.cyan(`• Цена: ${pool.price} SOL`));
            console.log(chalk.cyan(`• Налоги: Покупка ${buyTax}%, Продажа ${sellTax}%`));
            
            // Если включена автопокупка
            if (bot.config.autoBuy) {
              const buySpinner = ora(`Покупка токена ${tokenInfo.symbol}...`).start();
              try {
                const txId = await bot.buyToken(pool.tokenMint, bot.config.buyAmount);
                buySpinner.succeed(`Токен ${tokenInfo.symbol} куплен! Транзакция: ${txId}`);
                
                // Запускаем отслеживание цены
                console.log(chalk.blue(`Запуск отслеживания цены для ${tokenInfo.symbol}...`));
                bot.trackTokenPrice(pool.tokenMint, pool.price);
              } catch (err) {
                buySpinner.fail(`Ошибка при покупке токена ${tokenInfo.symbol}: ${err.message}`);
                
                // Предлагаем команду для ручной покупки
                console.log(chalk.yellow(`Для ручной покупки токена используйте: node index.js buy ${pool.tokenMint.toString()} ${bot.config.buyAmount}`));
              }
            } else {
              console.log(chalk.yellow(`Для покупки токена используйте: node index.js buy ${pool.tokenMint.toString()} ${bot.config.buyAmount}`));
            }
            
            console.log(); // Пустая строка для разделения
            
          } catch (poolErr) {
            console.log(chalk.red(`Ошибка при анализе нового пула: ${poolErr.message}`));
          }
          
          // Добавляем адрес пула в сет известных
          knownPoolAddresses.add(pool.address.toString());
        }
        
        progressBar = ora({
          text: `Мониторинг пулов... Проверка #${checkCount}, найдено: ${foundCount}`,
          spinner: 'dots'
        }).start();
      }
      
      // Обновляем список известных пулов
      knownPools = currentPools;
      
      // Отображаем оставшееся время
      const remainingTime = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const remainingMinutes = Math.floor(remainingTime / 60);
      const remainingSeconds = remainingTime % 60;
      progressBar.text = `Мониторинг пулов... Проверка #${checkCount}, найдено: ${foundCount} (осталось ${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')})`;      
      
      // Ждем перед следующей проверкой (3 секунды)
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err) {
      console.error(chalk.red(`Ошибка при мониторинге пулов: ${err.message}`));
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Завершаем мониторинг
  bot.running = false;
  progressBar.succeed(`Мониторинг завершен. Проверено ${checkCount} пулов, найдено ${foundCount} новых токенов`);
}

module.exports = { fastSnipe };