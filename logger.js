const chalk = require('chalk');

/**
 * Модуль для логгирования сообщений бота
 */
class Logger {
  /**
   * Запись информационного сообщения
   * @param {string} message Сообщение для логгирования
   */
  info(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.blue('INFO')} ${message}`);
  }
  
  /**
   * Запись предупреждения
   * @param {string} message Сообщение для логгирования
   */
  warn(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.yellow('WARN')} ${message}`);
  }
  
  /**
   * Запись ошибки
   * @param {string} message Сообщение для логгирования
   */
  error(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.red('ERROR')} ${message}`);
  }
  
  /**
   * Запись успешного действия
   * @param {string} message Сообщение для логгирования
   */
  success(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.green('SUCCESS')} ${message}`);
  }
  
  /**
   * Запись сообщения о найденном токене
   * @param {string} message Сообщение для логгирования
   */
  token(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.magenta('TOKEN')} ${message}`);
  }
  
  /**
   * Запись транзакции
   * @param {string} message Сообщение для логгирования
   */
  tx(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.cyan('TX')} ${message}`);
  }
}

module.exports = new Logger();