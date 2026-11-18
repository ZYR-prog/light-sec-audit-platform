/**
 * 标签页切换 Tabs
 * 负责人：C
 * 功能：实现标签页（Tab）切换效果
 *
 * 使用方法：
 *   // 方式一：自动初始化（推荐）
 *   // 给容器加 class="tabs"，自动生效
 *
 *   // 方式二：手动初始化
 *   var tabs = new Tabs('myTabs', {
 *     activeIndex: 0,       // 默认激活第几个，默认 0
 *     onChange: function(index, tabName) {  // 切换时的回调
 *       console.log('切换到第' + index + '个标签：' + tabName);
 *     }
 *   });
 *
 * HTML 结构要求：
 *   <div id="myTabs" class="tabs">
 *     <div class="tabs-nav">
 *       <button class="tabs-btn active" data-tab="tab1">标签一</button>
 *       <button class="tabs-btn" data-tab="tab2">标签二</button>
 *     </div>
 *     <div class="tabs-content">
 *       <div class="tabs-pane active" id="tab1">内容一</div>
 *       <div class="tabs-pane" id="tab2">内容二</div>
 *     </div>
 *   </div>
 */

function Tabs(containerId, options) {
  'use strict';

  this.container = document.getElementById(containerId);
  if (!this.container) {
    console.error('Tabs: 找不到容器，id=' + containerId);
    return;
  }

  this.options = Object.assign({
    activeIndex: 0,
    onChange: null
  }, options || {});

  this.buttons = this.container.querySelectorAll('.tabs-btn');
  this.panes = this.container.querySelectorAll('.tabs-pane');
  this.currentIndex = this.options.activeIndex;

  this._init();
}

Tabs.prototype._init = function() {
  var self = this;

  // 绑定点击事件
  self.buttons.forEach(function(btn, index) {
    btn.addEventListener('click', function() {
      self.switchTo(index);
    });
  });

  // 初始激活
  self.switchTo(self.currentIndex, true);

  // 注入基础样式（如果还没有）
  if (!document.getElementById('tabs-style')) {
    var style = document.createElement('style');
    style.id = 'tabs-style';
    style.textContent = [
      '.tabs-nav { display: flex; border-bottom: 2px solid #e5e7eb; margin-bottom: 16px; }',
      '.tabs-btn { padding: 10px 20px; background: none; border: none; cursor: pointer;',
      '  font-size: 14px; color: #6b7280; position: relative; bottom: -2px;',
      '  border-bottom: 2px solid transparent; transition: all 0.2s; }',
      '.tabs-btn:hover { color: #3B82F6; }',
      '.tabs-btn.active { color: #3B82F6; border-bottom-color: #3B82F6; font-weight: 600; }',
      '.tabs-pane { display: none; }',
      '.tabs-pane.active { display: block; animation: tabFadeIn 0.2s ease; }',
      '@keyframes tabFadeIn {',
      '  from { opacity: 0; transform: translateY(5px); }',
      '  to { opacity: 1; transform: translateY(0); }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }
};

Tabs.prototype.switchTo = function(index, silent) {
  var self = this;
  if (index < 0 || index >= self.buttons.length) return;

  self.currentIndex = index;

  // 更新按钮状态
  self.buttons.forEach(function(btn, i) {
    btn.classList.toggle('active', i === index);
  });

  // 更新内容面板
  self.panes.forEach(function(pane, i) {
    pane.classList.toggle('active', i === index);
  });

  // 回调
  if (!silent && typeof self.options.onChange === 'function') {
    var tabName = self.buttons[index].getAttribute('data-tab') || '';
    self.options.onChange(index, tabName);
  }
};

Tabs.prototype.getCurrent = function() {
  return this.currentIndex;
};

// ---------- 自动初始化（class="tabs" 的容器自动生效）----------
document.addEventListener('DOMContentLoaded', function() {
  var tabsContainers = document.querySelectorAll('.tabs[data-auto-init]');
  tabsContainers.forEach(function(container) {
    if (container.id) {
      new Tabs(container.id);
    }
  });
});
