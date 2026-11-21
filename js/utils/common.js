/**
 * 通用工具函数库 Utils
 * 负责人：C
 * 功能：常用的工具函数，日期格式化、深浅拷贝、防抖节流、类型判断等
 *
 * 使用方法：
 *   var dateStr = Utils.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss');
 *   var copy = Utils.deepClone(obj);
 *   var debouncedFn = Utils.debounce(fn, 300);
 *   ...
 */

var Utils = (function() {
  'use strict';

  // ========== 日期相关 ==========

  /**
   * 日期格式化
   * @param {Date|number|string} date - 日期对象、时间戳或日期字符串
   * @param {string} format - 格式字符串
   *   YYYY - 四位年
   *   MM   - 两位月（补零）
   *   DD   - 两位日（补零）
   *   HH   - 两位时（补零）
   *   mm   - 两位分（补零）
   *   ss   - 两位秒（补零）
   *   SSS  - 三位毫秒
   * @returns {string} 格式化后的日期字符串
   *
   * 示例：
   *   Utils.formatDate(new Date(), 'YYYY-MM-DD')           // 2026-11-18
   *   Utils.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')  // 2026-11-18 14:30:00
   *   Utils.formatDate(1234567890000, 'MM/DD/YYYY')        // 02/14/2009
   */
  function formatDate(date, format) {
    if (!date) return '';

    var d = new Date(date);
    if (isNaN(d.getTime())) return '';

    format = format || 'YYYY-MM-DD HH:mm:ss';

    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var hour = d.getHours();
    var minute = d.getMinutes();
    var second = d.getSeconds();
    var millisecond = d.getMilliseconds();

    // 补零函数
    function pad(num, len) {
      len = len || 2;
      var str = String(num);
      while (str.length < len) {
        str = '0' + str;
      }
      return str;
    }

    var tokens = {
      YYYY: String(year),
      MM: pad(month),
      DD: pad(day),
      HH: pad(hour),
      mm: pad(minute),
      ss: pad(second),
      SSS: pad(millisecond, 3)
    };

    // 用正则一次性替换，避免 SSS 被 ss 抢先匹配、以及重复占位符只替换第一个的问题
    return format.replace(/YYYY|SSS|MM|DD|HH|mm|ss/g, function (token) {
      return tokens[token];
    });
  }

  /**
   * 友好的时间显示（几秒前、几分钟前、几天前等）
   * @param {Date|number|string} date
   * @returns {string}
   */
  function timeAgo(date) {
    var d = new Date(date);
    if (isNaN(d.getTime())) return '';

    var now = Date.now();
    var diff = now - d.getTime();
    var seconds = Math.floor(diff / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';
    if (hours < 24) return hours + ' 小时前';
    if (days < 7) return days + ' 天前';
    if (days < 30) return Math.floor(days / 7) + ' 周前';
    if (days < 365) return Math.floor(days / 30) + ' 个月前';
    return Math.floor(days / 365) + ' 年前';
  }

  // ========== 对象/数组相关 ==========

  /**
   * 深拷贝
   * @param {*} obj - 要拷贝的对象
   * @returns {*} 拷贝后的新对象
   *
   * 支持：对象、数组、字符串、数字、布尔值、null、Date、RegExp
   * 不支持：函数、Symbol、循环引用（会栈溢出）
   */
  function deepClone(obj) {
    // 基本类型和 null 直接返回
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Date
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    // RegExp
    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }

    // 数组
    if (Array.isArray(obj)) {
      return obj.map(function(item) {
        return deepClone(item);
      });
    }

    // 普通对象
    var result = {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      result[key] = deepClone(obj[key]);
    }
    return result;
  }

  /**
   * 浅拷贝
   */
  function shallowClone(obj) {
    if (Array.isArray(obj)) {
      return obj.slice();
    }
    if (obj && typeof obj === 'object') {
      return Object.assign({}, obj);
    }
    return obj;
  }

  /**
   * 合并对象（浅合并）
   * @param {object} target - 目标对象
   * @param {...object} sources - 源对象
   * @returns {object} 合并后的目标对象
   */
  function merge(target) {
    if (target === null || typeof target !== 'object') {
      target = {};
    }
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      if (source && typeof source === 'object') {
        Object.keys(source).forEach(function(key) {
          target[key] = source[key];
        });
      }
    }
    return target;
  }

  // ========== 类型判断 ==========

  function getType(value) {
    return Object.prototype.toString.call(value).slice(8, -1).toLowerCase();
  }

  function isString(value) { return getType(value) === 'string'; }
  function isNumber(value) { return getType(value) === 'number' && !isNaN(value); }
  function isBoolean(value) { return getType(value) === 'boolean'; }
  function isArray(value) { return Array.isArray(value); }
  function isObject(value) { return getType(value) === 'object'; }
  function isFunction(value) { return getType(value) === 'function'; }
  function isNull(value) { return value === null; }
  function isUndefined(value) { return value === undefined; }
  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (isString(value)) return value.trim() === '';
    if (isArray(value)) return value.length === 0;
    if (isObject(value)) return Object.keys(value).length === 0;
    return false;
  }

  // ========== 函数相关 ==========

  /**
   * 防抖：函数在停止触发后 delay 毫秒才执行
   * @param {Function} fn - 要防抖的函数
   * @param {number} delay - 延迟时间（毫秒）
   * @param {boolean} immediate - 是否立即执行第一次
   * @returns {Function} 防抖后的函数
   */
  function debounce(fn, delay, immediate) {
    var timer = null;
    return function() {
      var context = this;
      var args = arguments;

      if (timer) clearTimeout(timer);

      if (immediate) {
        var callNow = !timer;
        timer = setTimeout(function() {
          timer = null;
        }, delay);
        if (callNow) fn.apply(context, args);
      } else {
        timer = setTimeout(function() {
          fn.apply(context, args);
        }, delay);
      }
    };
  }

  /**
   * 节流：函数在 wait 毫秒内最多执行一次
   * @param {Function} fn - 要节流的函数
   * @param {number} wait - 间隔时间（毫秒）
   * @returns {Function} 节流后的函数
   */
  function throttle(fn, wait) {
    var previous = 0;
    return function() {
      var now = Date.now();
      var context = this;
      var args = arguments;

      if (now - previous >= wait) {
        previous = now;
        fn.apply(context, args);
      }
    };
  }

  // ========== 字符串相关 ==========

  /**
   * 去除首尾空白
   */
  function trim(str) {
    if (str === null || str === undefined) return '';
    return String(str).trim();
  }

  /**
   * 首字母大写
   */
  function capitalize(str) {
    str = String(str || '');
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 截断字符串并加省略号
   * @param {string} str
   * @param {number} len - 最大长度
   * @param {string} suffix - 后缀，默认 '...'
   */
  function truncate(str, len, suffix) {
    str = String(str || '');
    suffix = suffix || '...';
    if (str.length <= len) return str;
    return str.substring(0, len) + suffix;
  }

  // ========== 数字相关 ==========

  /**
   * 数字范围限制
   * @param {number} num
   * @param {number} min
   * @param {number} max
   */
  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  /**
   * 生成随机整数 [min, max]
   */
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 文件大小格式化
   * @param {number} bytes - 字节数
   * @returns {string} 如 "1.5 MB"
   */
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ========== 其他 ==========

  /**
   * 生成唯一 ID（简易版）
   * @param {string} prefix - 前缀
   */
  function uniqueId(prefix) {
    prefix = prefix || 'id_';
    return prefix + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * 复制文本到剪贴板
   * @param {string} text - 要复制的文本
   * @returns {Promise<boolean>} 是否成功
   */
  function copyToClipboard(text) {
    return new Promise(function(resolve) {
      // 优先用现代 API
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text)
          .then(function() { resolve(true); })
          .catch(function() { resolve(fallback()); });
      } else {
        resolve(fallback());
      }

      function fallback() {
        try {
          var textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          var success = document.execCommand('copy');
          document.body.removeChild(textarea);
          return success;
        } catch (e) {
          return false;
        }
      }
    });
  }

  /**
   * HTML 转义（防止 XSS）
   * @param {string} html
   */
  function escapeHtml(html) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(html));
    return div.innerHTML;
  }

  // ========== 对外暴露 ==========
  return {
    // 日期
    formatDate: formatDate,
    timeAgo: timeAgo,

    // 对象/数组
    deepClone: deepClone,
    shallowClone: shallowClone,
    merge: merge,

    // 类型判断
    getType: getType,
    isString: isString,
    isNumber: isNumber,
    isBoolean: isBoolean,
    isArray: isArray,
    isObject: isObject,
    isFunction: isFunction,
    isNull: isNull,
    isUndefined: isUndefined,
    isEmpty: isEmpty,

    // 函数
    debounce: debounce,
    throttle: throttle,

    // 字符串
    trim: trim,
    capitalize: capitalize,
    truncate: truncate,

    // 数字
    clamp: clamp,
    randomInt: randomInt,
    formatFileSize: formatFileSize,

    // 其他
    uniqueId: uniqueId,
    copyToClipboard: copyToClipboard,
    escapeHtml: escapeHtml
  };
})();

// 同时暴露到 window 和 SAP 前缀 / SAP 命名空间，页面用哪种写法都能接上
window.Utils = Utils;
window.SAPUtils = Utils;
window.SAP = window.SAP || {};
window.SAP.Utils = Utils;
