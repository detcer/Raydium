const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram, 
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { 
  Token, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID 
} = require('@solana/spl-token');
const { RaydiumAPI } = require('./raydium');
const logger = require('./logger');
const bs58 = require('bs58');
const chalk = require('chalk');
const axios = require('axios');

/**
 * Класс снайпер-бота для автоматической торговли на Raydium
 */
class SniperBot {
  /**
   * Создание экземпляра снайпер-бота
   * @param {Connection} connection Подключение к Solana
   * @param {Keypair} keypair Ключевая пара кошелька
   * @param {Object} config Конфигурация бота
   */
  constructor(connection, keypair, config) {
    this.connection = connection;
    this.keypair = keypair;
    this.config = config;
    this.raydium = new RaydiumAPI(connection);
    this.running = false;
    this.boughtTokens = {};
  }
  
  /**
   * Запуск бота
   */
  async start() {
    if (this.running) {
      logger.warn('Бот уже запущен');
      return;
    }
    
    this.running = true;
    logger.info('Снайпер-бот запущен');
    
    try {
      // Инициализируем Raydium SDK
      logger.info('Инициализация Raydium SDK...');
      await this.raydium.initializeRaydium(this.keypair);
      
      // Проверяем баланс кошелька
      try {
        const balance = await this.connection.getBalance(this.keypair.publicKey);
        logger.info(`Баланс кошелька: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (balance < this.config.buyAmount * LAMPORTS_PER_SOL) {
          logger.error(`Недостаточно средств для покупки. Необходимо: ${this.config.buyAmount} SOL`);
          this.running = false;
          return;
        }
      } catch (balErr) {
        logger.error(`Ошибка при получении баланса: ${balErr.message}`);
        // Продолжаем работу, даже если не можем получить баланс
      }
      
      // Запускаем мониторинг новых пулов Raydium
      await this.monitorRaydiumPools();
    } catch (err) {
      logger.error(`Ошибка при запуске бота: ${err.message}`);
      this.running = false;
    }
  }
  
  /**
   * Остановка бота
   */
  stop() {
    this.running = false;
    logger.info('Бот остановлен');
  }
  
  /**
   * Мониторинг новых пулов ликвидности на Raydium
   */
  async monitorRaydiumPools() {
    logger.info('Начало мониторинга новых пулов Raydium...');
    
    // Получаем текущие пулы для сравнения
    let knownPools = await this.raydium.getAllPools();
    logger.info(`Загружено ${knownPools.length} существующих пулов Raydium`);
    
    // Храним адреса пулов в сете для быстрого поиска
    const knownPoolAddresses = new Set(knownPools.map(pool => pool.address.toString()));
    logger.info(`Создан индекс известных пулов: ${knownPoolAddresses.size} адресов`);
    
    // Переменная для отслеживания времени последнего обнаружения нового пула
    let lastNewPoolTime = Date.now();
    let checkCount = 0;
    
    // Запускаем бесконечный цикл проверки новых пулов
    while (this.running) {
      try {
        checkCount++;
        const startTime = Date.now();
        
        // Каждый 10-й раз выводим информацию о продолжении мониторинга
        if (checkCount % 10 === 0) {
          const timeSinceLastNewPool = Math.floor((Date.now() - lastNewPoolTime) / 1000);
          logger.info(`Мониторинг продолжается... (Проверка #${checkCount}, Последний новый пул: ${timeSinceLastNewPool} сек. назад)`);
        }
        
        // Получаем текущий список пулов
        const currentPools = await this.raydium.getAllPools();
        const currentPoolsCount = currentPools.length;
        
        // Находим новые пулы
        const newPools = currentPools.filter(pool => 
          !knownPoolAddresses.has(pool.address.toString())
        );
        
        // Обрабатываем новые пулы
        if (newPools.length > 0) {
          logger.info(`Обнаружено ${newPools.length} новых пулов ликвидности из ${currentPoolsCount} всего`);
          lastNewPoolTime = Date.now(); // Обновляем время последнего обнаружения
          
          // Перебираем и анализируем каждый новый пул
          for (const pool of newPools) {
            try {
              // Фильтруем по минимальной ликвидности
              if (pool.liquidity < this.config.minLiquidityInSol) {
                logger.info(`Пул ${pool.tokenMint.toString()} пропущен: недостаточная ликвидность (${pool.liquidity} SOL < ${this.config.minLiquidityInSol} SOL)`);
                continue;
              }
              
              // Проверяем пул на соответствие критериям
              await this.analyzePool(pool);
              
              // Добавляем адрес пула в сет известных
              knownPoolAddresses.add(pool.address.toString());
            } catch (poolErr) {
              logger.error(`Ошибка при анализе нового пула: ${poolErr.message}`);
            }
          }
        } else if (checkCount % 10 === 0) {
          // Если нет новых пулов, иногда сообщаем об этом
          logger.info(`Новых пулов не обнаружено. Всего пулов: ${currentPoolsCount}`);
        }
        
        // Обновляем список известных пулов
        knownPools = currentPools;
        
        // Вычисляем время выполнения итерации
        const processingTime = Date.now() - startTime;
        
        // Ждем перед следующей проверкой, учитывая время обработки
        const delayTime = Math.max(5000 - processingTime, 1000); // Минимум 1 секунда, максимум 5 секунд
        await new Promise(resolve => setTimeout(resolve, delayTime));
      } catch (err) {
        logger.error(`Ошибка при мониторинге пулов: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }
  
  /**
   * Анализ пула ликвидности
   * @param {Object} pool Информация о пуле
   */
  async analyzePool(pool) {
    try {
      logger.info(`Анализ нового пула: ${pool.tokenMint.toString()}`);
      
      // Убираем строгую проверку полей - позволяем боту работать с любыми пулами
      logger.info(`Пул ${pool.tokenMint.toString()} проходит базовую проверку`);
      
      // Получаем информацию о токене
      const tokenInfo = await this.checkToken(pool.tokenMint);
      
      // Проверяем ликвидность
      if (pool.liquidity < this.config.minLiquidityInSol) {
        logger.info(`Токен ${tokenInfo.symbol} пропущен: недостаточная ликвидность (${pool.liquidity} SOL < ${this.config.minLiquidityInSol} SOL)`);
        return;
      }
      
      // Проверяем налоги с более либеральным подходом
      const buyTax = await this.estimateBuyTax(pool);
      const sellTax = await this.estimateSellTax(pool);
      
      if (buyTax > this.config.maxBuyTax) {
        logger.info(`Токен ${tokenInfo.symbol} пропущен: слишком высокий налог на покупку (${buyTax}%)`);
        return;
      }
      
      if (sellTax > this.config.maxSellTax) {
        logger.info(`Токен ${tokenInfo.symbol} пропущен: слишком высокий налог на продажу (${sellTax}%)`);
        return;
      }
      
      // Проверка успешна, выводим информацию о токене
      logger.success(`Найден подходящий токен: ${tokenInfo.symbol} (${tokenInfo.name})`);
      logger.info(`- Адрес: ${pool.tokenMint.toString()}`);
      logger.info(`- Ликвидность: ${pool.liquidity} SOL`);
      logger.info(`- Цена: ${pool.price} SOL`);
      logger.info(`- Налог на покупку: ${buyTax}%`);
      logger.info(`- Налог на продажу: ${sellTax}%`);
      
      // Если включена автопокупка, выполняем покупку
      if (this.config.autoBuy) {
        logger.info(`Автоматическая покупка токена ${tokenInfo.symbol}...`);
        try {
          const txId = await this.buyToken(pool.tokenMint, this.config.buyAmount);
          logger.success(`Токен ${tokenInfo.symbol} куплен! Транзакция: ${txId}`);
          
          // Сохраняем информацию о купленном токене для отслеживания
          this.boughtTokens[pool.tokenMint.toString()] = {
            symbol: tokenInfo.symbol,
            buyPrice: pool.price,
            buyTime: new Date().toISOString(),
            amount: this.config.buyAmount
          };
          
          // Запускаем отслеживание цены для этого токена
          this.trackTokenPrice(pool.tokenMint, pool.price);
        } catch (err) {
          logger.error(`Ошибка при покупке токена ${tokenInfo.symbol}: ${err.message}`);
        }
      } else {
        logger.info(`Автопокупка отключена. Используйте команду 'buy ${pool.tokenMint.toString()} ${this.config.buyAmount}' для ручной покупки`);
      }
    } catch (err) {
      logger.error(`Ошибка при анализе пула: ${err.message}`);
    }
  }
  
  /**
   * Отслеживание цены токена для автопродажи и стоп-лосса
   * @param {PublicKey} tokenMint Адрес минта токена
   * @param {number} buyPrice Цена покупки токена
   */
  async trackTokenPrice(tokenMint, buyPrice) {
    const tokenData = this.boughtTokens[tokenMint.toString()];
    if (!tokenData) return;
    
    logger.info(`Начало отслеживания цены токена ${tokenData.symbol}...`);
    
    const checkInterval = setInterval(async () => {
      try {
        if (!this.running || !this.boughtTokens[tokenMint.toString()]) {
          clearInterval(checkInterval);
          return;
        }
        
        // Получаем текущую цену токена
        const pool = await this.raydium.getPoolByTokenMint(tokenMint);
        if (!pool) {
          logger.warn(`Пул ликвидности для токена ${tokenData.symbol} не найден`);
          return;
        }
        
        const currentPrice = pool.price;
        const priceDiffPercent = ((currentPrice - buyPrice) / buyPrice) * 100;
        
        // Выводим информацию о текущей цене
        logger.info(`Токен ${tokenData.symbol}: текущая цена = ${currentPrice} SOL (${priceDiffPercent > 0 ? '+' : ''}${priceDiffPercent.toFixed(2)}%)`);
        
        // Проверяем условия для автопродажи
        if (priceDiffPercent >= this.config.autoSellAt) {
          logger.success(`Достигнута цель прибыли ${this.config.autoSellAt}% для токена ${tokenData.symbol}`);
          await this.sellToken(tokenMint, 100);
          clearInterval(checkInterval);
        }
        // Проверяем условия для стоп-лосса
        else if (priceDiffPercent <= -this.config.stopLossAt) {
          logger.warn(`Достигнут стоп-лосс -${this.config.stopLossAt}% для токена ${tokenData.symbol}`);
          await this.sellToken(tokenMint, 100);
          clearInterval(checkInterval);
        }
      } catch (err) {
        logger.error(`Ошибка при отслеживании цены токена ${tokenData.symbol}: ${err.message}`);
      }
    }, 10000); // Проверяем каждые 10 секунд
  }
  
  /**
   * Оценка налога на покупку
   * @param {Object} pool Пул ликвидности
   * @returns {number} Оценка налога на покупку в процентах
   */
  async estimateBuyTax(pool) {
    try {
      // Получаем информацию о пуле
      const poolInfo = await this.raydium.getPoolByTokenMint(pool.tokenMint);
      if (!poolInfo) {
        // Если пул не найден, возвращаем низкий налог для новых токенов
        logger.info(`Пул не найден для оценки налога, предполагаем низкий налог на покупку: 2%`);
        return 2;
      }
      
      // Анализируем объем торгов за 24 часа
      const volume24h = poolInfo.volume24h || 0;
      const liquidity = poolInfo.liquidity || 0;
      
      // Для новых токенов часто нет истории торгов
      if (volume24h === 0) {
        logger.info(`Нет данных о торгах, предполагаем стандартный налог на покупку: 3%`);
        return 3;
      }
      
      // Если объем торгов очень низкий, возможен высокий налог
      if (volume24h < liquidity * 0.01) {
        logger.info(`Низкий объем торгов, возможен высокий налог на покупку: 8%`);
        return 8;
      }
      
      // Для обычных токенов возвращаем умеренный налог
      logger.info(`Стандартная оценка налога на покупку: 2%`);
      return 2;
    } catch (err) {
      logger.warn(`Ошибка при оценке налога на покупку: ${err.message}, предполагаем умеренный налог: 3%`);
      return 3; // Вместо 100% возвращаем разумное значение
    }
  }
  
  /**
   * Оценка налога на продажу
   * @param {Object} pool Пул ликвидности
   * @returns {number} Оценка налога на продажу в процентах
   */
  async estimateSellTax(pool) {
    try {
      // Получаем информацию о пуле
      const poolInfo = await this.raydium.getPoolByTokenMint(pool.tokenMint);
      if (!poolInfo) {
        // Если пул не найден, возвращаем низкий налог для новых токенов
        logger.info(`Пул не найден для оценки налога, предполагаем низкий налог на продажу: 3%`);
        return 3;
      }
      
      // Анализируем объем торгов за 24 часа
      const volume24h = poolInfo.volume24h || 0;
      const liquidity = poolInfo.liquidity || 0;
      
      // Для новых токенов часто нет истории торгов
      if (volume24h === 0) {
        logger.info(`Нет данных о торгах, предполагаем стандартный налог на продажу: 4%`);
        return 4;
      }
      
      // Если объем торгов очень низкий, возможен высокий налог
      if (volume24h < liquidity * 0.01) {
        logger.info(`Низкий объем торгов, возможен высокий налог на продажу: 9%`);
        return 9;
      }
      
      // Для обычных токенов возвращаем умеренный налог
      logger.info(`Стандартная оценка налога на продажу: 3%`);
      return 3;
    } catch (err) {
      logger.warn(`Ошибка при оценке налога на продажу: ${err.message}, предполагаем умеренный налог: 4%`);
      return 4; // Вместо 100% возвращаем разумное значение
    }
  }
  
  /**
   * Получение информации о токене
   * @param {PublicKey} tokenMint Адрес минта токена
   * @returns {Object} Информация о токене
   */
  async checkToken(tokenMint) {
    try {
      // Проверяем валидность tokenMint
      if (!tokenMint || !(tokenMint instanceof PublicKey)) {
        throw new Error('Невалидный адрес токена');
      }
      
      // Получаем данные о токене
      const tokenInfo = await this.raydium.getTokenInfo(tokenMint);
      
      // Получаем информацию о пуле ликвидности
      const pool = await this.raydium.getPoolByTokenMint(tokenMint);
      
      return {
        address: tokenMint.toString(),
        symbol: tokenInfo.symbol || 'UNKNOWN',
        name: tokenInfo.name || 'Unknown Token',
        decimals: tokenInfo.decimals || 9,
        supply: tokenInfo.supply || 0,
        raydiumPool: pool ? {
          address: pool.address.toString(),
          liquidity: pool.liquidity,
          price: pool.price
        } : null
      };
    } catch (err) {
      logger.error(`Ошибка при получении информации о токене: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Покупка токена
   * @param {PublicKey} tokenMint Адрес минта токена
   * @param {number} amountInSol Количество SOL для покупки
   * @returns {string} ID транзакции
   */
  async buyToken(tokenMint, amountInSol) {
    try {
      logger.info(`Попытка покупки токена: ${tokenMint.toString()}`);
      
      // Получаем пул ликвидности
      const pool = await this.raydium.getPoolByTokenMint(tokenMint);
      logger.info(`Поиск пула ликвидности для токена: ${pool ? 'найден' : 'не найден'}`);
      
      if (!pool) {
        // Попробуем обновить список пулов и повторить поиск
        logger.info(`Пул не найден, попытка обновления списка пулов...`);
        
        // Принудительно обновляем кэш пулов
        this.raydium.clearPoolsCache();
        
        // Получаем свежие данные
        const updatedPools = await this.raydium.getAllPools();
        logger.info(`Получено ${updatedPools.length} пулов после обновления`);
        
        // Повторная попытка поиска пула
        const updatedPool = await this.raydium.getPoolByTokenMint(tokenMint);
        
        if (!updatedPool) {
          // Если пул все еще не найден, пробуем искать вручную
          logger.info(`Повторный поиск не удался, пробуем найти пул вручную...`);
          
          // Ручной поиск подходящего пула
          const manualPool = updatedPools.find(p => {
            try {
              return p.tokenMint.toString() === tokenMint.toString();
            } catch (err) {
              return false;
            }
          });
          
          if (!manualPool) {
            throw new Error('Пул ликвидности не найден даже после обновления списка пулов');
          }
          
          logger.success(`Пул найден с помощью ручного поиска!`);
          
          // Создаем транзакцию с найденным пулом
          const { transaction, instructions } = await this.raydium.createSwapSolToTokenTransaction({
            tokenMint,
            amountIn: amountInSol * LAMPORTS_PER_SOL,
            slippage: this.config.slippage,
            walletPublicKey: this.keypair.publicKey,
            pool: manualPool // Передаем найденный пул
          });
          
          // Отправляем транзакцию
          const txId = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.keypair],
            { commitment: 'confirmed' }
          );
          
          return txId;
        } else {
          // Используем обновленный пул
          logger.success(`Пул найден после обновления!`);
          const { transaction, instructions } = await this.raydium.createSwapSolToTokenTransaction({
            tokenMint,
            amountIn: amountInSol * LAMPORTS_PER_SOL,
            slippage: this.config.slippage,
            walletPublicKey: this.keypair.publicKey,
            pool: updatedPool
          });
          
          // Отправляем транзакцию
          const txId = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.keypair],
            { commitment: 'confirmed' }
          );
          
          return txId;
        }
      } else {
        // Используем найденный пул
        const { transaction, instructions } = await this.raydium.createSwapSolToTokenTransaction({
          tokenMint,
          amountIn: amountInSol * LAMPORTS_PER_SOL,
          slippage: this.config.slippage,
          walletPublicKey: this.keypair.publicKey,
          pool
        });
        
        // Отправляем транзакцию
        const txId = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.keypair],
          { commitment: 'confirmed' }
        );
        
        return txId;
      }
    } catch (err) {
      logger.error(`Ошибка при покупке токена: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Продажа токена
   * @param {PublicKey} tokenMint Адрес минта токена
   * @param {number} percentage Процент от баланса для продажи (1-100)
   * @returns {string} ID транзакции
   */
  async sellToken(tokenMint, percentage) {
    try {
      if (percentage < 1 || percentage > 100) {
        throw new Error('Процент должен быть от 1 до 100');
      }
      
      // Получаем пул ликвидности
      const pool = await this.raydium.getPoolByTokenMint(tokenMint);
      if (!pool) {
        throw new Error('Пул ликвидности не найден');
      }
      
      // Получаем баланс токена
      const tokenBalance = await this.raydium.getTokenBalance(tokenMint, this.keypair.publicKey);
      
      // Вычисляем количество токенов для продажи
      const amountToSell = tokenBalance * percentage / 100;
      
      // Создаем транзакцию для свапа TOKEN -> SOL
      const { transaction, instructions } = await this.raydium.createSwapTokenToSolTransaction({
        tokenMint,
        amountIn: amountToSell,
        slippage: this.config.slippage,
        walletPublicKey: this.keypair.publicKey
      });
      
      // Отправляем транзакцию
      const txId = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair],
        { commitment: 'confirmed' }
      );
      
      // Если продаем 100%, удаляем токен из отслеживаемых
      if (percentage === 100) {
        delete this.boughtTokens[tokenMint.toString()];
      }
      
      return txId;
    } catch (err) {
      logger.error(`Ошибка при продаже токена: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Получение портфеля токенов
   * @returns {Array} Массив информации о токенах
   */
  async getPortfolio() {
    try {
      // Получаем все токен-аккаунты пользователя
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.keypair.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );
      
      const portfolio = [];
      
      for (const { account } of tokenAccounts.value) {
        const tokenMint = new PublicKey(account.data.parsed.info.mint);
        const balance = account.data.parsed.info.tokenAmount.uiAmount;
        
        // Пропускаем токены с нулевым балансом
        if (balance <= 0) continue;
        
        try {
          // Получаем информацию о токене
          const tokenInfo = await this.checkToken(tokenMint);
          
          // Получаем пул ликвидности
          const pool = await this.raydium.getPoolByTokenMint(tokenMint);
          
          // Вычисляем стоимость в SOL
          const valueInSol = pool ? balance * pool.price : 0;
          
          // Получаем цену SOL в USD
          const solPrice = await this.getSolanaPrice();
          
          // Добавляем токен в портфель
          portfolio.push({
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            address: tokenMint.toString(),
            balance,
            valueInSol,
            valueInUsd: valueInSol * solPrice
          });
        } catch (err) {
          logger.warn(`Не удалось получить информацию о токене ${tokenMint.toString()}: ${err.message}`);
        }
      }
      
      return portfolio;
    } catch (err) {
      logger.error(`Ошибка при получении портфеля: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Получение текущей цены Solana в USD
   * @returns {number} Цена SOL в USD
   */
  async getSolanaPrice() {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      return response.data.solana.usd;
    } catch (err) {
      logger.warn(`Не удалось получить цену Solana: ${err.message}`);
      return 100; // Значение по умолчанию
    }
  }
}

module.exports = { SniperBot };