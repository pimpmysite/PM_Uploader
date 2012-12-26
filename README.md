WordPress 3.5 以降で動作するシンプルなアップローダーです。

#使い方

1.ダウンロードしたファイル一式を、テーマフォルダまたはプラグインのフォルダ内にコピーします。
サブフォルダ内にまとめても大丈夫です。

2.テーマまたはプラグインから「class-pm-uploader.php」をインクルードします。

3.フォームの HTML を出力するところで `PM_Uploader :: render( $args )` と書きます。パラメータの詳細は後述。

4.POST されたデータ `$_POST['field_name']` に画像 ID が入ります。

#パラメータ

$args には連想配列かクエリストリングの書式で以下のパラメータを与えます。

* field_id  
(string) (required) アップロードコンテナ要素に付けられる ID。

* field_name  
(string) (optional) 画像の ID を持つ input フィールドの name 属性値。省略時は field_id と同じになります。

* media_id  
(integer) (optional) アップロード済の画像があればその ID。ドロップゾーンの下にサムネイルを表示します。

#参照

[標準のメディアアップローダーは使わない！クライアントワークで重宝するシンプルUIの簡単アップローダー | Pimp My Site](http://pimpmysite.net/archives/9 "pimpmysite.net の記事を開きます")
