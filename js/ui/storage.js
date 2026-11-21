/**
 * localStorage 本地存储封装 Storage
 * 负责人：C
 * 功能：封装 localStorage，支持过期时间、JSON 自动转换、命名空间前缀
 *
 * 使用方法：
 *   // 存
 *   Storage.set('username', '张三');
 *   Storage.set('userInfo', { name: '张三', age: 20 }, { expires: 7 * 24 * 3600 }); // 7天过期
 *
 *   // 取
 *   var name = Storage.get('username');
 *   var user = Storage.get('userInfo');
 *
 *   // 删除
 *   Storage.remove('username');
 *
 *   // 清空当前命名空间下的所有数据
 *   Storage.clear();
 *
 *   // 检查是否支持 localStorage
 *   if (Storage.isSupported()) { ... }
 */

var Storage = (function() {
  'use strict';

  var PREFIX = 'sap_'; // 项目前缀（security-audit-platform）
  var SEPARATOR = '|||'; // 过期时间和值的分隔符

  // 检测是否支持 localStorage
  function isSupported() {
    try {
      var key = '__test__';
      localStorage.setItem(key, key);
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 给 key 加前缀
  function getFullKey(key) {
    return PREFIX + key;
  }

  // 把值和过期时间打包成字符串
  function pack(value, options) {
    var expires = options && options.expires ? options.expires : 0;
    var expireTime = expires > 0 ? Date.now() + expires * 1000 : 0;
    return expireTime + SEPARATOR + JSON.stringify(value);
  }

  // 解析存储的字符串，返回值或 null（过期了就返回 null）
  function unpack(str) {
    if (str === null || str === undefined) return null;

    var sepIndex = str.indexOf(SEPARATOR);
    if (sepIndex === -1) {
      // 老数据，没有过期时间，直接返回
      try {
        return JSON.parse(str);
      } catch (e) {
        return str;
      }
    }

    var expireTime = parseInt(str.substring(0, sepIndex));
    var valueStr = str.substring(sepIndex + SEPARATOR.length);

    // 检查是否过期
    if (expireTime > 0 && Date.now() > expireTime) {
      return null; // 过期了
    }

    try {
      return JSON.parse(valueStr);
    } catch (e) {
      return valueStr;
    }
  }

  /**
   * 存数据
   * @param {string} key - 键名
   * @param {*} value - 值（会自动 JSON 序列化）
   * @param {object} options - 配置项
   *   - expires: 过期时间（秒），0 表示不过期
   */
  function set(key, value, options) {
    if (!isSupported()) {
      console.warn('Storage: 浏览器不支持 localStorage');
      return false;
    }

    try {
      var fullKey = getFullKey(key);
      var packed = pack(value, options);
      localStorage.setItem(fullKey, packed);
      return true;
    } catch (e) {
      console.error('Storage: 保存失败，' + e.message);
      return false;
    }
  }

  /**
   * 取数据
   * @param {string} key - 键名
   * @param {*} defaultValue - 默认值（取不到时返回）
   * @returns {*} 值或默认值
   */
  function get(key, defaultValue) {
    if (!isSupported()) {
      return defaultValue !== undefined ? defaultValue : null;
    }

    var fullKey = getFullKey(key);
    var str = localStorage.getItem(fullKey);
    var value = unpack(str);

    if (value === null) {
      // 过期了或者不存在
      if (str !== null) {
        // 过期了，顺手删掉
        localStorage.removeItem(fullKey);
      }
      return defaultValue !== undefined ? defaultValue : null;
    }

    return value;
  }

  /**
   * 删除某个数据
   * @param {string} key - 键名
   */
  function remove(key) {
    if (!isSupported()) return;
    localStorage.removeItem(getFullKey(key));
  }

  /**
   * 清空当前项目前缀下的所有数据
   */
  function clear() {
    if (!isSupported()) return;

    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(function(key) {
      localStorage.removeItem(key);
    });
  }

  /**
   * 检查某个 key 是否存在（且未过期）
   * @param {string} key
   * @returns {boolean}
   */
  function has(key) {
    return get(key) !== null;
  }

  /**
   * 获取剩余过期时间（秒）
   * @param {string} key
   * @returns {number} 剩余秒数，-1 表示永久，0 表示已过期或不存在
   */
  function getRemainingTime(key) {
    if (!isSupported()) return 0;

    var fullKey = getFullKey(key);
    var str = localStorage.getItem(fullKey);
    if (str === null) return 0;

    var sepIndex = str.indexOf(SEPARATOR);
    if (sepIndex === -1) return -1; // 老数据，不过期

    var expireTime = parseInt(str.substring(0, sepIndex));
    if (expireTime === 0) return -1; // 不过期

    var remaining = Math.floor((expireTime - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  // 对外暴露
  var api = {
    isSupported: isSupported,
    set: set,
    get: get,
    remove: remove,
    clear: clear,
    has: has,
    getRemainingTime: getRemainingTime
  };

  // 浏览器本身有 window.Storage 接口，额外暴露一个不冲突的名字给 ES Module 用
  window.SapStorage = api;
  return api;
})();
