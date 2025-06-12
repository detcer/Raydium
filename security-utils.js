const crypto = require('crypto');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Утилиты для безопасной работы с ключами
 */
class SecurityUtils {
  /**
   * Зашифровать приватный ключ
   * @param {string} privateKey - Приватный ключ в base58
   * @param {string} password - Пароль для шифрования
   * @returns {object} Зашифрованные данные
   */
  static encryptPrivateKey(privateKey, password) {
    const algorithm = 'aes-256-gcm';
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }
  
  /**
   * Расшифровать приватный ключ
   * @param {object} encryptedData - Зашифрованные данные
   * @param {string} password - Пароль для расшифровки
   * @returns {string} Приватный ключ
   */
  static decryptPrivateKey(encryptedData, password) {
    const algorithm = 'aes-256-gcm';
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Проверить валидность приватного ключа
   * @param {string} privateKey - Приватный ключ в base58
   * @returns {boolean} Валидность ключа
   */
  static isValidPrivateKey(privateKey) {
    try {
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      return true;
    } catch (err) {
      return false;
    }
  }
  
  /**
   * Получить публичный ключ из приватного
   * @param {string} privateKey - Приватный ключ в base58
   * @returns {string} Публичный ключ
   */
  static getPublicKey(privateKey) {
    try {
      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);
      return keypair.publicKey.toString();
    } catch (err) {
      throw new Error('Невалидный приватный ключ');
    }
  }
  
  /**
   * Создать резервную копию .env файла
   * @param {string} backupDir - Директория для резервных копий
   */
  static backupEnvFile(backupDir = './backups') {
    try {
      // Создаем директорию если её нет
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      // Проверяем наличие .env файла
      if (!fs.existsSync('.env')) {
        throw new Error('.env файл не найден');
      }
      
      // Создаем имя файла с временной меткой
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const backupPath = path.join(backupDir, `env-backup-${timestamp}.bak`);
      
      // Копируем файл
      fs.copyFileSync('.env', backupPath);
      
      // Устанавливаем права только для чтения
      fs.chmodSync(backupPath, 0o400);
      
      console.log(chalk.green(`✓ Резервная копия создана: ${backupPath}`));
      return backupPath;
    } catch (err) {
      console.error(chalk.red(`Ошибка при создании резервной копии: ${err.message}`));
      throw err;
    }
  }
  
  /**
   * Проверить безопасность окружения
   */
  static checkEnvironmentSecurity() {
    const issues = [];
    
    // Проверка .env файла
    if (fs.existsSync('.env')) {
      const stats = fs.statSync('.env');
      const mode = (stats.mode & parseInt('777', 8)).toString(8);
      
      if (mode !== '600' && mode !== '400') {
        issues.push({
          level: 'warning',
          message: '.env файл имеет небезопасные права доступа. Рекомендуется установить chmod 600'
        });
      }
    }
    
    // Проверка .gitignore
    if (fs.existsSync('.gitignore')) {
      const gitignore = fs.readFileSync('.gitignore', 'utf8');
      if (!gitignore.includes('.env')) {
        issues.push({
          level: 'critical',
          message: '.env файл не добавлен в .gitignore! Это критическая проблема безопасности'
        });
      }
    } else {
      issues.push({
        level: 'critical',
        message: '.gitignore файл отсутствует! Создайте его и добавьте .env'
      });
    }
    
    // Проверка конфигурационного файла
    if (fs.existsSync('solsniper-config.json')) {
      const config = JSON.parse(fs.readFileSync('solsniper-config.json', 'utf8'));
      if (config.privateKey) {
        issues.push({
          level: 'critical',
          message: 'Приватный ключ найден в конфигурационном файле! Удалите его немедленно'
        });
      }
    }
    
    // Вывод результатов
    if (issues.length === 0) {
      console.log(chalk.green('✓ Проверка безопасности пройдена успешно'));
    } else {
      console.log(chalk.yellow('\n⚠️  Обнаружены проблемы безопасности:\n'));
      issues.forEach(issue => {
        if (issue.level === 'critical') {
          console.log(chalk.red(`  ✘ [КРИТИЧНО] ${issue.message}`));
        } else {
          console.log(chalk.yellow(`  ⚠ [Предупреждение] ${issue.message}`));
        }
      });
      console.log('');
    }
    
    return issues;
  }
  
  /**
   * Генерация нового кошелька
   * @returns {object} Новый кошелек
   */
  static generateNewWallet() {
    const keypair = Keypair.generate();
    const privateKey = bs58.encode(keypair.secretKey);
    const publicKey = keypair.publicKey.toString();
    
    return {
      privateKey,
      publicKey,
      keypair
    };
  }
}

// Если запущен как отдельный скрипт
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'check':
      console.log(chalk.bold.blue('🔐 Проверка безопасности окружения...\n'));
      SecurityUtils.checkEnvironmentSecurity();
      break;
      
    case 'backup':
      console.log(chalk.bold.blue('💾 Создание резервной копии .env файла...\n'));
      SecurityUtils.backupEnvFile();
      break;
      
    case 'generate':
      console.log(chalk.bold.blue('🔑 Генерация нового кошелька...\n'));
      const wallet = SecurityUtils.generateNewWallet();
      console.log(chalk.green('Новый кошелек создан:\n'));
      console.log(chalk.cyan(`Публичный ключ: ${wallet.publicKey}`));
      console.log(chalk.yellow(`Приватный ключ: ${wallet.privateKey}`));
      console.log(chalk.red('\n⚠️  ВАЖНО: Сохраните приватный ключ в безопасном месте!'));
      break;
      
    default:
      console.log(chalk.bold.yellow('Утилиты безопасности для Solana Sniper Bot\n'));
      console.log('Использование:');
      console.log('  node security-utils.js check    - Проверка безопасности');
      console.log('  node security-utils.js backup   - Создать резервную копию .env');
      console.log('  node security-utils.js generate - Создать новый кошелек');
  }
}

module.exports = SecurityUtils;
