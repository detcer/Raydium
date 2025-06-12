const fs = require('fs');
const path = require('path');

/**
 * Загрузка конфигурации из файла
 * @param {string} configPath Путь к файлу конфигурации
 * @returns {Object} Объект конфигурации
 */
function loadConfig(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (err) {
    console.error(`Ошибка при загрузке конфигурации: ${err.message}`);
  }
  
  return {};
}

/**
 * Сохранение конфигурации в файл
 * @param {string} configPath Путь к файлу конфигурации
 * @param {Object} config Объект конфигурации
 */
function saveConfig(configPath, config) {
  try {
    // Создаем директорию, если ее нет
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Сохраняем конфигурацию в файл
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error(`Ошибка при сохранении конфигурации: ${err.message}`);
  }
}

module.exports = {
  loadConfig,
  saveConfig
};