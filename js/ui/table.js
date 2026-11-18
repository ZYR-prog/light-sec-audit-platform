/**
 * 表格筛选与排序 TableHelper
 * 负责人：C
 * 功能：给普通 HTML 表格增加按列排序和关键词筛选功能
 *
 * 使用方法：
 *   // 初始化一个表格
 *   var myTable = new TableHelper('myTable', {
 *     sortable: true,        // 是否启用排序，默认 true
 *     filterable: true,      // 是否启用筛选，默认 true
 *     filterInputId: 'searchInput', // 筛选输入框的 id
 *     filterColumns: [0, 1], // 哪些列参与筛选（列索引），默认全部列
 *     initialSort: { col: 0, dir: 'asc' } // 初始排序列和方向
 *   });
 *
 *   // 手动刷新数据（如果表格内容变了）
 *   myTable.refresh();
 *
 * HTML 结构要求：
 *   <table id="myTable">
 *     <thead>
 *       <tr>
 *         <th data-sort="string">列名1</th>   ← 加 data-sort 指定排序方式
 *         <th data-sort="number">列名2</th>   ← string 或 number
 *         <th>不排序的列</th>                  ← 不加 data-sort 就不能排序
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr><td>...</td><td>...</td></tr>
 *     </tbody>
 *   </table>
 */

function TableHelper(tableId, options) {
  'use strict';

  this.table = document.getElementById(tableId);
  if (!this.table) {
    console.error('TableHelper: 找不到表格，id=' + tableId);
    return;
  }

  this.options = Object.assign({
    sortable: true,
    filterable: true,
    filterInputId: null,
    filterColumns: null, // null 表示所有列
    initialSort: null,
    onSort: null,   // 排序后的回调
    onFilter: null  // 筛选后的回调
  }, options || {});

  this.thead = this.table.querySelector('thead');
  this.tbody = this.table.querySelector('tbody');
  this.rows = [];        // 原始行数据备份
  this.sortState = null; // { col: 0, dir: 'asc' }

  this._init();
}

TableHelper.prototype._init = function() {
  // 备份原始行数据
  this._backupRows();

  // 初始化排序
  if (this.options.sortable && this.thead) {
    this._initSort();
  }

  // 初始化筛选
  if (this.options.filterable && this.options.filterInputId) {
    this._initFilter();
  }

  // 初始排序
  if (this.options.initialSort) {
    this.sort(this.options.initialSort.col, this.options.initialSort.dir);
  }
};

// ---------- 数据备份 ----------
TableHelper.prototype._backupRows = function() {
  var self = this;
  self.rows = [];
  var trs = self.tbody.querySelectorAll('tr');
  trs.forEach(function(tr) {
    self.rows.push(tr.cloneNode(true));
  });
};

// ---------- 排序功能 ----------
TableHelper.prototype._initSort = function() {
  var self = this;
  var ths = self.thead.querySelectorAll('th');

  ths.forEach(function(th, index) {
    var sortType = th.getAttribute('data-sort');
    if (!sortType) return; // 没加 data-sort 的列不排序

    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.setAttribute('data-col-index', index);

    // 加排序箭头占位
    var arrow = document.createElement('span');
    arrow.className = 'sort-arrow';
    arrow.style.cssText = 'margin-left: 6px; font-size: 12px; color: #9ca3af;';
    arrow.textContent = '↕';
    th.appendChild(arrow);

    th.addEventListener('click', function() {
      var colIndex = parseInt(th.getAttribute('data-col-index'));
      var currentDir = self.sortState && self.sortState.col === colIndex
        ? self.sortState.dir
        : null;
      var newDir = currentDir === 'asc' ? 'desc' : 'asc';
      self.sort(colIndex, newDir);
    });
  });
};

TableHelper.prototype.sort = function(colIndex, direction) {
  var self = this;
  var ths = self.thead.querySelectorAll('th');
  var sortType = ths[colIndex].getAttribute('data-sort') || 'string';
  direction = direction || 'asc';

  // 更新排序状态
  self.sortState = { col: colIndex, dir: direction };

  // 更新表头箭头
  ths.forEach(function(th, i) {
    var arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (i === colIndex) {
      arrow.textContent = direction === 'asc' ? '↑' : '↓';
      arrow.style.color = '#3B82F6';
    } else {
      arrow.textContent = '↕';
      arrow.style.color = '#9ca3af';
    }
  });

  // 读取当前可见的行（考虑筛选后的结果）
  var visibleRows = [];
  var allRows = self.tbody.querySelectorAll('tr');
  allRows.forEach(function(tr) {
    if (tr.style.display !== 'none') {
      visibleRows.push(tr.cloneNode(true));
    }
  });

  // 排序
  visibleRows.sort(function(a, b) {
    var valA = a.children[colIndex].textContent.trim();
    var valB = b.children[colIndex].textContent.trim();

    if (sortType === 'number') {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
      return direction === 'asc' ? valA - valB : valB - valA;
    } else {
      // 字符串排序（支持中文）
      return direction === 'asc'
        ? valA.localeCompare(valB, 'zh-CN')
        : valB.localeCompare(valA, 'zh-CN');
    }
  });

  // 清空 tbody 并重新插入排序后的行
  self.tbody.innerHTML = '';
  visibleRows.forEach(function(tr) {
    self.tbody.appendChild(tr);
  });

  // 回调
  if (typeof self.options.onSort === 'function') {
    self.options.onSort(colIndex, direction);
  }
};

// ---------- 筛选功能 ----------
TableHelper.prototype._initFilter = function() {
  var self = this;
  var input = document.getElementById(self.options.filterInputId);
  if (!input) {
    console.error('TableHelper: 找不到筛选输入框，id=' + self.options.filterInputId);
    return;
  }

  var timer = null;
  input.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      self.filter(input.value.trim().toLowerCase());
    }, 200); // 防抖
  });
};

TableHelper.prototype.filter = function(keyword) {
  var self = this;
  var filterCols = self.options.filterColumns;
  var matchCount = 0;

  var trs = self.tbody.querySelectorAll('tr');
  trs.forEach(function(tr) {
    var tds = tr.querySelectorAll('td');
    var found = false;

    for (var i = 0; i < tds.length; i++) {
      // 如果指定了筛选列，只在这些列里找
      if (filterCols && filterCols.indexOf(i) === -1) continue;

      var text = tds[i].textContent.toLowerCase();
      if (text.indexOf(keyword) !== -1) {
        found = true;
        break;
      }
    }

    tr.style.display = found || keyword === '' ? '' : 'none';
    if (found || keyword === '') matchCount++;
  });

  // 回调
  if (typeof self.options.onFilter === 'function') {
    self.options.onFilter(keyword, matchCount);
  }
};

// ---------- 刷新 ----------
TableHelper.prototype.refresh = function() {
  var self = this;
  self._backupRows();

  // 重建 tbody
  self.tbody.innerHTML = '';
  self.rows.forEach(function(tr) {
    self.tbody.appendChild(tr.cloneNode(true));
  });

  // 重新应用排序
  if (self.sortState) {
    self.sort(self.sortState.col, self.sortState.dir);
  }

  // 重新应用筛选
  if (self.options.filterable && self.options.filterInputId) {
    var input = document.getElementById(self.options.filterInputId);
    if (input && input.value) {
      self.filter(input.value.trim().toLowerCase());
    }
  }
};
