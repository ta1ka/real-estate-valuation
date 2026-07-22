# ネット公開するときの設定

このサイトは不動産情報ライブラリAPIキーを使うため、HTMLだけではなく Node.js サーバーごと公開します。

## 公開先のおすすめ

最初は Render が分かりやすいです。

## Renderで公開する流れ

1. このフォルダをGitHubにアップロードします。
2. Renderで「New Web Service」を作ります。
3. GitHubのこのリポジトリを選びます。
4. Build Command は `npm install` にします。
5. Start Command は `npm start` にします。
6. Environment Variables に次を登録します。

```txt
REINFOLIB_API_KEY=あなたの不動産情報ライブラリAPIキー
```

`PORT` はRender側が自動で指定するため、基本は登録しなくて大丈夫です。

## GitHubに上げてはいけないもの

`.env` はAPIキーが入るため、GitHubに上げません。`.gitignore` で除外済みです。

## ローカルで動かすとき

```powershell
npm install
npm start
```

ブラウザで `http://localhost:3001` を開きます。
