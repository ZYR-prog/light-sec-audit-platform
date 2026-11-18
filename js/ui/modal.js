/**
 * 弹窗组件 Modal
 * 负责人：C
 * 功能：提供提示框、确认框两种弹窗
 *
 * 使用方法：
 *   // 提示框（只有确定按钮）
 *   Modal.alert('操作成功', { type: 'success' });
 *
 *   // 确认框（有确定和取消按钮）
 *   Modal.confirm('确定要删除吗？', {
 *     onOk: function() { console.log('点击了确定'); },
 *     onCancel: function() { console.log('点击了取消'); }
 *   });
 *
 * 配置项：
 *   title    - 弹窗标题，默认'提示'
 *   type     - 类型：'info' | 'success' | 'warning' | 'error'，默认'info'
 *   okText   - 确定按钮文字，默认'确定'
 *   cancelText - 取消按钮文字，默认'取消'
 *   onOk     - 点击确定的回调
 *   onCancel - 点击取消的回调
 *   duration - 自动关闭时间（毫秒），0 表示不自动关闭，默认 0
 */

var Modal = (function() {
  'use strict';

  // 图标（用 SVG，不依赖外部资源）
  var icons = {
    info:    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
  };

  // 创建遮罩层和弹窗容器（只创建一次）
  var overlay = null;
  var modalBox = null;
  var autoCloseTimer = null;

  function ensureElements() {
    if (overlay) return;

    // 遮罩层
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 9999;';

    // 弹窗框
    modalBox = document.createElement('div');
    modalBox.className = 'modal-box';
    modalBox.style.cssText = 'background: #fff; border-radius: 8px; min-width: 320px; max-width: 480px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); animation: modalFadeIn 0.2s ease;';

    overlay.appendChild(modalBox);
    document.body.appendChild(overlay);

    // 添加动画样式
    var style = document.createElement('style');
    style.textContent = [
      '@keyframes modalFadeIn {',
      '  from { opacity: 0; transform: scale(0.9) translateY(-10px); }',
      '  to { opacity: 1; transform: scale(1) translateY(0); }',
      '}',
      '.modal-header { display: flex; align-items: center; gap: 12px; padding: 20px 20px 12px; }',
      '.modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #1f2937; }',
      '.modal-body { padding: 0 20px 20px; font-size: 14px; color: #4b5563; line-height: 1.6; }',
      '.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px 20px; }',
      '.modal-btn { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; transition: background 0.2s; }',
      '.modal-btn-primary { background: #3B82F6; color: #fff; }',
      '.modal-btn-primary:hover { background: #2563EB; }',
      '.modal-btn-default { background: #F3F4F6; color: #374151; }',
      '.modal-btn-default:hover { background: #E5E7EB; }',
      '.modal-btn-danger { background: #EF4444; color: #fff; }',
      '.modal-btn-danger:hover { background: #DC2626; }'
    ].join('\n');
    document.head.appendChild(style);

    // 点击遮罩层关闭
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        close();
      }
    });

    // ESC 关闭
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.style.display === 'flex') {
        close();
      }
    });
  }

  function open(type, message, options) {
    ensureElements();
    options = options || {};
    var title = options.title || '提示';
    var okText = options.okText || '确定';
    var cancelText = options.cancelText || '取消';
    var showCancel = type === 'confirm';
    var iconType = options.type || 'info';

    // 清自动关闭定时器
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }

    // 构建弹窗内容
    var iconHtml = icons[iconType] || icons.info;

    // 危险确认框用红色确定按钮
    var okBtnClass = 'modal-btn modal-btn-primary';
    if (iconType === 'error' && showCancel) {
      okBtnClass = 'modal-btn modal-btn-danger';
    }

    modalBox.innerHTML = [
      '<div class="modal-header">',
      '  <span class="modal-icon">' + iconHtml + '</span>',
      '  <h3>' + title + '</h3>',
      '</div>',
      '<div class="modal-body">' + message + '</div>',
      '<div class="modal-footer">',
      showCancel ? '  <button class="modal-btn modal-btn-default" data-action="cancel">' + cancelText + '</button>' : '',
      '  <button class="' + okBtnClass + '" data-action="ok">' + okText + '</button>',
      '</div>'
    ].join('');

    // 绑定按钮事件
    var okBtn = modalBox.querySelector('[data-action="ok"]');
    var cancelBtn = modalBox.querySelector('[data-action="cancel"]');

    okBtn.addEventListener('click', function() {
      if (typeof options.onOk === 'function') {
        options.onOk();
      }
      close();
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        if (typeof options.onCancel === 'function') {
          options.onCancel();
        }
        close();
      });
    }

    // 显示
    overlay.style.display = 'flex';

    // 自动关闭
    if (options.duration && options.duration > 0) {
      autoCloseTimer = setTimeout(close, options.duration);
    }

    // 聚焦确定按钮，方便回车确认
    okBtn.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.style.display = 'none';
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  }

  // 对外暴露的 API
  return {
    /**
     * 提示框（只有确定按钮）
     * @param {string} message - 提示内容
     * @param {object} options - 配置项
     */
    alert: function(message, options) {
      open('alert', message, options || {});
    },

    /**
     * 确认框（确定 + 取消）
     * @param {string} message - 提示内容
     * @param {object} options - 配置项
     */
    confirm: function(message, options) {
      open('confirm', message, options || {});
    },

    /**
     * 手动关闭弹窗
     */
    close: close
  };
})();
