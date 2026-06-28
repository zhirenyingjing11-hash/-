/**
 * 50_menu.gs  ── スプレッドシートのメニュー（統合版）
 * --------------------------------------------------
 * ⚠ 重要: onOpen は1プロジェクトに1つだけにしてください。
 *   既存の threadsweekprep.gs にある onOpen() は「関数ごと削除」し、
 *   この統合版 onOpen を使ってください（食レポ運用の項目もここに含めています）。
 * --------------------------------------------------
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // Amazonアフィリ自動投稿
  ui.createMenu('アフィリ自動投稿')
    .addItem('① シートを準備', 'setupSheets')
    .addItem('② 文章を一括生成（商品マスタ）', 'generateAll')
    .addSeparator()
    .addItem('Instagram自動投稿トリガー設置', 'installInstagramTrigger')
    .addItem('設定チェック', 'checkConfig')
    .addToUi();

  // 既存の食レポ運用メニュー（threadsweekprep.gs の関数を呼ぶ）
  const shokurepo = ui.createMenu('食レポ運用');
  if (typeof prepareWeek === 'function') shokurepo.addItem('① 来週分の投稿枠を作成', 'prepareWeek');
  if (typeof checkPosts === 'function')  shokurepo.addItem('② 予約中の投稿をチェック', 'checkPosts');
  if (typeof setupUserId === 'function') {
    shokurepo.addSeparator()
      .addItem('ユーザーID取得（初回）', 'setupUserId')
      .addItem('自動投稿トリガー設置（初回）', 'installTrigger')
      .addItem('トークン更新', 'refreshToken');
  }
  shokurepo.addToUi();
}
