/**
 * 面包屑导航 Breadcrumb
 * 负责人：C
 * 功能：根据当前页面自动生成面包屑导航
 *
 * 使用方法：
 *   // 在页面放一个容器
 *   <nav id="breadcrumb" class="breadcrumb"></nav>
 *
 *   // 初始化（在页面底部调用）
 *   Breadcrumb.init('breadcrumb', {
 *     homeText: '首页',
 *     homeUrl: '../index.html'
 *   });
 *
 *   // 也可以手动设置面包屑路径
 *   Breadcrumb.set([
 *     { text: '首页', url: '../index.html' },
 *     { text: '审计任务', url: null }  // 当前页 url 传 null
 *   ]);
 */

var Breadcrumb = (function() {
  'use strict';

  // 页面路径和面包屑名称的映射表
  // 新增页面时在这里加一条就行
  var pageMap = {
    'dashboard.html':  { text: '仪表盘', parent: null },
    'audit-task.html': { text: '审计任务', parent: 'dashboard.html' },
    'baseline.html':   { text: '安全基线库', parent: 'dashboard.html' },
    'report.html':     { text: '审计报告', parent: 'audit-task.html' },
    'history.html':    { text: '历史记录', parent: 'dashboard.html' },
    'login.html':      { text: '登录', parent: null },
    'help.html':       { text: '帮助', parent: 'dashboard.html' }
  };

  var config = {
    homeText: '首页',
    homeUrl: '../index.html',
    separator: '/'
  };

  function init(containerId, options) {
    var container = document.getElementById(containerId);
    if (!container) {
      console.error('Breadcrumb: 找不到容器，id=' + containerId);
      return;
    }

    Object.assign(config, options || {});

    // 根据当前页面自动生成
    var path = window.location.pathname;
    var fileName = path.substring(path.lastIndexOf('/') + 1);
    var crumbs = generateFromPage(fileName);

    render(container, crumbs);
  }

  // 根据当前页面文件名生成面包屑路径
  function generateFromPage(fileName) {
    var crumbs = [];
    var current = pageMap[fileName];

    if (!current) {
      // 不在映射表里的页面，只显示首页
      return [{ text: config.homeText, url: config.homeUrl }];
    }

    // 当前页（最底层）
    crumbs.unshift({ text: current.text, url: null });

    // 往上追溯父级
    var parentFile = current.parent;
    while (parentFile && pageMap[parentFile]) {
      var parent = pageMap[parentFile];
      crumbs.unshift({ text: parent.text, url: parentFile });
      parentFile = parent.parent;
    }

    // 最前面加首页
    crumbs.unshift({ text: config.homeText, url: config.homeUrl });

    return crumbs;
  }

  function set(crumbs, containerId) {
    var container = document.getElementById(containerId || 'breadcrumb');
    if (!container) return;
    render(container, crumbs);
  }

  function render(container, crumbs) {
    var html = '';

    crumbs.forEach(function(item, index) {
      var isLast = index === crumbs.length - 1;

      if (isLast || !item.url) {
        html += '<span class="breadcrumb-item breadcrumb-current">' + item.text + '</span>';
      } else {
        html += '<a class="breadcrumb-item" href="' + item.url + '">' + item.text + '</a>';
        html += '<span class="breadcrumb-separator">' + config.separator + '</span>';
      }
    });

    container.innerHTML = html;

    // 注入样式
    if (!document.getElementById('breadcrumb-style')) {
      var style = document.createElement('style');
      style.id = 'breadcrumb-style';
      style.textContent = [
        '.breadcrumb { font-size: 14px; color: #6b7280; margin-bottom: 16px; }',
        '.breadcrumb-item { color: #6b7280; text-decoration: none; transition: color 0.2s; }',
        '.breadcrumb-item:hover { color: #3B82F6; }',
        '.breadcrumb-current { color: #1f2937; font-weight: 500; cursor: default; }',
        '.breadcrumb-separator { margin: 0 8px; color: #d1d5db; }'
      ].join('\n');
      document.head.appendChild(style);
    }
  }

  // 动态添加页面映射（方便扩展）
  function addPage(fileName, text, parent) {
    pageMap[fileName] = { text: text, parent: parent || null };
  }

  return {
    init: init,
    set: set,
    addPage: addPage
  };
})();
