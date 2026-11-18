/**
 * 折叠面板 Collapse
 * 负责人：C
 * 功能：手风琴式折叠面板，点击标题展开/收起内容
 *
 * 使用方法：
 *   // 方式一：自动初始化（推荐）
 *   // 给容器加 class="collapse"，自动生效
 *
 *   // 方式二：手动初始化
 *   var collapse = new Collapse('myCollapse', {
 *     multiple: false,   // 是否允许多个同时展开，默认 false（手风琴模式）
 *     activeIndex: 0,    // 默认展开第几个，默认 -1（都不展开）
 *     onChange: function(index, isOpen) { }  // 切换时回调
 *   });
 *
 * HTML 结构要求：
 *   <div id="myCollapse" class="collapse">
 *     <div class="collapse-item">
 *       <div class="collapse-header">标题一</div>
 *       <div class="collapse-body">内容一</div>
 *     </div>
 *     <div class="collapse-item">
 *       <div class="collapse-header">标题二</div>
 *       <div class="collapse-body">内容二</div>
 *     </div>
 *   </div>
 */

function Collapse(containerId, options) {
  'use strict';

  this.container = document.getElementById(containerId);
  if (!this.container) {
    console.error('Collapse: 找不到容器，id=' + containerId);
    return;
  }

  this.options = Object.assign({
    multiple: false,
    activeIndex: -1,
    onChange: null
  }, options || {});

  this.items = this.container.querySelectorAll('.collapse-item');
  this.openStates = []; // 每个面板的展开状态

  this._init();
}

Collapse.prototype._init = function() {
  var self = this;

  // 初始化状态
  self.items.forEach(function(item, index) {
    var header = item.querySelector('.collapse-header');
    var body = item.querySelector('.collapse-body');

    if (!header || !body) return;

    // 初始状态
    var isOpen = index === self.options.activeIndex;
    self.openStates[index] = isOpen;

    // 箭头图标
    var arrow = document.createElement('span');
    arrow.className = 'collapse-arrow';
    arrow.style.cssText = 'transition: transform 0.3s; display: inline-block; margin-left: auto;';
    arrow.textContent = '▼';
    header.appendChild(arrow);

    // 设置初始展开/收起
    if (isOpen) {
      item.classList.add('active');
      body.style.maxHeight = body.scrollHeight + 'px';
      arrow.style.transform = 'rotate(180deg)';
    } else {
      body.style.maxHeight = '0';
      body.style.overflow = 'hidden';
    }

    // 点击事件
    header.style.cursor = 'pointer';
    header.addEventListener('click', function() {
      self.toggle(index);
    });
  });

  // 注入样式
  if (!document.getElementById('collapse-style')) {
    var style = document.createElement('style');
    style.id = 'collapse-style';
    style.textContent = [
      '.collapse-item { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; overflow: hidden; }',
      '.collapse-item.active { border-color: #BFDBFE; }',
      '.collapse-header { display: flex; align-items: center; padding: 12px 16px;',
      '  background: #f9fafb; font-weight: 500; font-size: 14px; color: #374151;',
      '  user-select: none; transition: background 0.2s; }',
      '.collapse-item.active .collapse-header { background: #EFF6FF; color: #1D4ED8; }',
      '.collapse-header:hover { background: #f3f4f6; }',
      '.collapse-item.active .collapse-header:hover { background: #DBEAFE; }',
      '.collapse-body { transition: max-height 0.3s ease; max-height: 0; overflow: hidden; }',
      '.collapse-body-inner { padding: 16px; font-size: 14px; color: #4b5563; line-height: 1.6; }',
      '.collapse-arrow { font-size: 10px; color: #9ca3af; }',
      '.collapse-item.active .collapse-arrow { color: #3B82F6; }'
    ].join('\n');
    document.head.appendChild(style);
  }
};

Collapse.prototype.toggle = function(index) {
  var self = this;
  var item = self.items[index];
  if (!item) return;

  var body = item.querySelector('.collapse-body');
  var arrow = item.querySelector('.collapse-arrow');
  var willOpen = !self.openStates[index];

  if (self.options.multiple) {
    // 多开模式：只切换当前这一个
    self._setItemState(index, willOpen);
  } else {
    // 手风琴模式：关掉其他的，切换当前的
    self.items.forEach(function(_, i) {
      if (i === index) {
        self._setItemState(i, willOpen);
      } else {
        self._setItemState(i, false);
      }
    });
  }

  // 回调
  if (typeof self.options.onChange === 'function') {
    self.options.onChange(index, willOpen);
  }
};

Collapse.prototype._setItemState = function(index, isOpen) {
  var self = this;
  var item = self.items[index];
  if (!item) return;

  var body = item.querySelector('.collapse-body');
  var arrow = item.querySelector('.collapse-arrow');

  self.openStates[index] = isOpen;

  if (isOpen) {
    item.classList.add('active');
    body.style.maxHeight = body.scrollHeight + 'px';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  } else {
    item.classList.remove('active');
    body.style.maxHeight = '0';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
};

Collapse.prototype.open = function(index) {
  if (!this.openStates[index]) {
    this.toggle(index);
  }
};

Collapse.prototype.close = function(index) {
  if (this.openStates[index]) {
    this.toggle(index);
  }
};

Collapse.prototype.openAll = function() {
  if (!this.options.multiple) return; // 手风琴模式不支持全展开
  var self = this;
  self.items.forEach(function(_, i) {
    self._setItemState(i, true);
  });
};

Collapse.prototype.closeAll = function() {
  var self = this;
  self.items.forEach(function(_, i) {
    self._setItemState(i, false);
  });
};

// ---------- 自动初始化（class="collapse" 且有 data-auto-init 的自动生效）----------
document.addEventListener('DOMContentLoaded', function() {
  var containers = document.querySelectorAll('.collapse[data-auto-init]');
  containers.forEach(function(container) {
    if (container.id) {
      new Collapse(container.id);
    }
  });
});
