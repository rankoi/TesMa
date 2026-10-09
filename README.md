# TesMa Android

オフラインでも使える、学習課題・小テスト管理アプリです。既存の画面デザインを参考に、新しいAndroidアプリとして構成しています。元の `forWeb(変更禁止)` は変更しません。

## 現在の機能

- 課題・小テストの登録、編集、完了/未完了の切り替え、削除
- 一覧の「未完了のみ」フィルター
- 教科をプルダウンから選択し、上部の「教科設定」で教科名・色を編集
- Androidでは端末内SQLiteに保存（ネット接続不要）
- Androidローカル通知による期限リマインダー（設定日数前・前日を午後9時に通知。期限当日は通知しない）
- Androidの共有メニュー（Files、Driveなど）を使ったJSONバックアップの保存と復元
- ブラウザー開発時はlocalStorageを使用

Googleスプレッドシート連携は行いません。Androidの共有メニューからFilesやDriveなど保存先を選び、バックアップJSONを保管できます。アプリ上部の復元ボタンからバックアップJSONを読み込めます。Discord通知は使用しません。

初期の教科は論理国語、古典探求、英コミュ、論理・表現、数学III、数学C、化学、物理、倫政、情報、家庭科、保健 体育、その他です。設定した色はタスクカードに反映します。色を指定しない場合は灰色（`#808080`）を使います。参考用の旧Web版GASでは空色の既定値が`#007bff`でしたが、Android版は今回の指定に従って灰色を採用しています。教科設定も端末内に保存され、JSONバックアップ・復元の対象になります。

バックアップはアプリ右上の上向き矢印を押し、共有メニューでFiles/Driveなどを選んで保存します。端末内のDownloadsやクラウドなど、アプリ外にもファイルを保管してください。復元時は右上の下向き矢印から保存済みのJSONを選びます（現在のタスクはバックアップ内容に置き換わります）。

タスクは端末内SQLiteに保存し、起動時に既存DB接続を確認して再利用します。SQLite初期化に失敗した場合もWebViewの端末保存領域へフォールバックします。Android SQLiteの読み込み時に必須の空`values`配列が欠けていた問題を修正し、以前の端末保存データはDBが空ならSQLiteへ移行します。バックアップはスマホ故障・機種変更に備えて別の保存先にも保管してください。

## 開発環境

- Node.js LTSとnpm
- Android StudioおよびAndroid SDK（Android SDK Platform、Build Tools、Platform Tools）
- Java/JDK（Android Studioに付属のJBRを利用可能）

## 起動・APK作成

1. このフォルダーで `npm install` を実行します。
2. `npm run dev` でブラウザー開発サーバーを起動できます。ブラウザーではSQLite/通知の代わりにlocalStorageを使います。
3. `npm run android:sync` でWebアセットをビルドし、Androidプロジェクトへ同期します。
4. Android Studioで `android` フォルダーを開き、Gradle同期後、Build > Build Bundle(s) / APK(s) > Build APK(s) を実行します。
5. デバッグAPKは通常 `android/app/build/outputs/apk/debug/app-debug.apk` に出力されます。実機へUSBデバッグでインストールするか、APKを端末へコピーしてインストールします。

AndroidプロジェクトはAndroid SDKが入った環境でGradle同期・ビルドしてください。ここでのViteビルド成功だけではAPKビルド成功を意味しません。

