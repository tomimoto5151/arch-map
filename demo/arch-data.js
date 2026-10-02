// arch-map のデータです。/arch-map スキルが読み書きします（手で直すときは JSON の書式を守ってください）
window.ARCH_MAP = {
  "version": 2,
  "project": {
    "name": "みんなのレシピ",
    "summary": "料理のレシピを投稿・検索できるWebアプリです。ブラウザに映る画面と、Vercel で動く Next.js のサーバーが中心で、写真の保存やメール送信はクラウドのサービスを借りています。",
    "updated": "2026-10-03",
    "commit": "00d37f2"
  },
  "groups": [
    {"id": "people", "name": "使う人", "desc": "アプリを使う人たち", "color": "gray"},
    {"id": "browser", "name": "ブラウザ", "desc": "スマホや PC に表示される Next.js の画面", "color": "orange"},
    {"id": "vercel", "name": "Vercel（Next.js サーバー）", "desc": "注文を受けて処理する本体", "color": "blue"},
    {"id": "db", "name": "データベース", "desc": "レシピと利用者の記録", "color": "green"},
    {"id": "cloud", "name": "クラウドのサービス", "desc": "よそから借りている機能", "color": "purple"},
    {"id": "scripts", "name": "開発用スクリプト", "desc": "作るときに使う道具", "color": "pink", "tool": true}
  ],
  "nodes": [
    {
      "id": "visitor",
      "group": "people",
      "step": [1, 10],
      "name": "利用者",
      "role": "スマホやPCのブラウザで使う",
      "detail": "レシピを探したり、自分のレシピを投稿したりする人です。この図のすべての流れは、ここから始まります。",
      "analogy": "お店にやってくるお客さんです。",
      "actor": true
    },
    {
      "id": "staff",
      "group": "people",
      "step": 1,
      "name": "運営スタッフ",
      "role": "投稿を見回って管理する",
      "detail": "不適切な投稿がないかを見回り、必要なら非表示にする人です。",
      "analogy": "お店の店長です。",
      "actor": true
    },
    {
      "id": "web",
      "group": "browser",
      "step": 2,
      "name": "レシピ画面",
      "role": "レシピを見る・探す・投稿する",
      "detail": "利用者が実際に目にする画面です。レシピの一覧や詳しいページ、投稿フォームを表示します。表示に必要なデータは、自分では持たずにサーバーへ頼んで受け取ります。",
      "analogy": "お店の売り場です。お客さんが商品（レシピ）を見て回る場所です。",
      "plan": {"tech": "Next.js"},
      "built": {
        "tech": "Next.js",
        "progress": 0.8,
        "files": ["app/page.tsx", "app/recipes/[id]/page.tsx", "app/new/page.tsx"],
        "note": "投稿フォームの写真アップロード部分がまだ作業中です。"
      }
    },
    {
      "id": "view",
      "group": "browser",
      "step": 9,
      "name": "表示されるレシピ",
      "role": "検索結果やレシピのページ",
      "detail": "サーバーから返ってきたレシピが、一覧や詳しいページとして画面に並びます。利用者が最後に目にするものです。",
      "analogy": "売り場の棚に並んだ商品です。",
      "output": true,
      "plan": {"tech": "Next.js"},
      "built": {"tech": "Next.js", "files": ["app/recipes/[id]/page.tsx", "app/search/page.tsx"]}
    },
    {
      "id": "admin",
      "group": "browser",
      "step": 2,
      "name": "管理画面",
      "role": "問題のある投稿を管理する",
      "detail": "運営スタッフだけが使う画面です。不適切な投稿を非表示にしたり、問い合わせに対応したりします。",
      "analogy": "お店のバックヤードです。お客さんからは見えない管理用の部屋です。",
      "plan": {"tech": "Next.js", "note": "公開後、投稿が増えてから作る予定です。"}
    },
    {
      "id": "auth",
      "group": "vercel",
      "step": 3,
      "name": "ログイン機能",
      "role": "本人かどうかを確かめる",
      "detail": "メールアドレスやGoogleアカウントを使って、利用者が本人かどうかを確かめます。ログインした人だけがレシピを投稿できるようにしています。",
      "analogy": "建物の入口にいる受付係です。名札を確認してから中に通します。",
      "plan": {"tech": "Auth.js"},
      "built": {
        "tech": "Auth.js",
        "files": ["auth.ts", "app/api/auth/[...nextauth]/route.ts"],
        "issue": "ログイン後に元のページへ戻るテストが1件失敗しています。"
      }
    },
    {
      "id": "api",
      "group": "vercel",
      "step": [4, 8],
      "name": "APIサーバー",
      "role": "画面からの注文を受けて処理する",
      "detail": "画面から「レシピの一覧がほしい」「この投稿を保存して」といった注文を受け取ります。データベースや他の機能に指示を出し、結果を画面に返します。",
      "analogy": "レストランの厨房です。注文を受けて、料理（データ）を作って返します。",
      "plan": {"tech": "Next.js Route Handlers"},
      "built": {"tech": "Next.js Route Handlers", "files": ["app/api/recipes/route.ts", "app/api/upload/route.ts"]}
    },
    {
      "id": "search",
      "group": "vercel",
      "step": 5,
      "name": "検索機能",
      "role": "キーワードでレシピを探す",
      "detail": "「カレー 簡単」のようなキーワードから、合いそうなレシピを探して返します。",
      "analogy": "図書館の司書さんです。キーワードを伝えると、合いそうな本を探してくれます。",
      "plan": {"tech": "Meilisearch", "note": "表記ゆれ（「たまご」と「卵」など）にも強い、専用の検索エンジンを使う計画です。"},
      "built": {"tech": "SQLite の部分一致検索", "progress": 0.5, "note": "まずはデータベースの簡単な検索で代用しています。"}
    },
    {
      "id": "db",
      "group": "db",
      "step": 6,
      "name": "データベース",
      "role": "レシピや利用者の情報を保存",
      "detail": "レシピ、利用者、お気に入りなどの情報を、表の形で整理してしまっておく場所です。アプリを止めても消えません。",
      "analogy": "お店の倉庫です。商品（データ）を棚に整理して保管します。",
      "plan": {"tech": "PostgreSQL"},
      "built": {
        "tech": "SQLite",
        "files": ["prisma/schema.prisma"],
        "note": "開発中は手軽な SQLite を使い、公開するときに PostgreSQL へ移す予定です。"
      }
    },
    {
      "id": "storage",
      "group": "cloud",
      "step": 5,
      "name": "画像置き場",
      "role": "料理の写真を保存する",
      "detail": "投稿された料理の写真を保存する場所です。写真はサイズが大きいので、データベースとは別の専用の置き場に入れます。",
      "analogy": "写真専用のアルバム棚です。",
      "service": {
        "name": "Cloudflare R2",
        "provider": "Cloudflare",
        "docs": "https://developers.cloudflare.com/r2/",
        "env": ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
      },
      "plan": {"tech": "Amazon S3"},
      "built": {"tech": "Cloudflare R2", "progress": 0.6, "files": ["lib/storage.ts"]}
    },
    {
      "id": "mail",
      "group": "cloud",
      "step": 7,
      "name": "メール送信",
      "role": "お知らせメールを届ける",
      "detail": "「あなたのレシピにコメントが付きました」などのお知らせメールを送ります。メールを確実に届けるのは難しいので、専門のサービスを借ります。",
      "analogy": "郵便屋さんです。手紙を代わりに届けてくれます。",
      "service": {"name": "Resend", "provider": "Resend", "docs": "https://resend.com/docs", "env": ["RESEND_API_KEY"]},
      "plan": {"tech": "Resend"}
    },
    {
      "id": "analytics",
      "group": "cloud",
      "step": 3,
      "name": "アクセス解析",
      "role": "どのページが見られたか数える",
      "detail": "どのレシピがよく見られているかを数えて、グラフで確認できるようにします。計画にはありませんでしたが、人気のレシピを知るために追加しました。",
      "analogy": "お店の入口にある来店カウンターです。",
      "service": {"name": "Vercel Web Analytics", "provider": "Vercel", "docs": "https://vercel.com/docs/analytics"},
      "built": {"tech": "Vercel Web Analytics", "files": ["app/layout.tsx"]}
    },
    {
      "id": "seed",
      "group": "scripts",
      "name": "初期データ投入",
      "role": "見本のレシピを入れる",
      "detail": "開発を始めるときに、見本のレシピや利用者をデータベースにまとめて入れるスクリプトです。本番のサービスの中では動きません。",
      "analogy": "開店前に棚へ見本の商品を並べる作業です。",
      "plan": {"tech": "Prisma"},
      "built": {"tech": "Prisma", "files": ["prisma/seed.ts"]}
    }
  ],
  "edges": [
    {"from": "visitor", "to": "web", "label": "画面を開く"},
    {"from": "staff", "to": "admin", "label": "投稿を見回る"},
    {"from": "web", "to": "auth", "label": "ログインする"},
    {"from": "web", "to": "api", "label": "データを頼む"},
    {"from": "admin", "to": "api", "label": "投稿を管理する"},
    {"from": "web", "to": "analytics", "label": "閲覧を記録する"},
    {"from": "auth", "to": "db", "label": "利用者を確認する"},
    {"from": "api", "to": "search", "label": "検索を頼む"},
    {"from": "api", "to": "db", "label": "読み書きする"},
    {"from": "api", "to": "storage", "label": "写真を保存する"},
    {"from": "search", "to": "db", "label": "レシピを探す"},
    {"from": "api", "to": "mail", "label": "通知を頼む"},
    {"from": "api", "to": "view", "label": "レシピを返す", "kind": "result"},
    {"from": "view", "to": "visitor", "label": "レシピを見る", "kind": "result"},
    {"from": "seed", "to": "db", "label": "見本のレシピを入れる"}
  ],
  "glossary": [
    {"term": "API", "desc": "画面とサーバーがやりとりするための「注文の受付窓口」です。決まった形で頼むと、決まった形で答えが返ってきます。"},
    {"term": "データベース", "desc": "情報を表の形で整理して保存し、すばやく取り出せるようにする仕組みです。"},
    {"term": "Next.js", "desc": "Webアプリの画面とサーバーをまとめて作れる、人気の道具（フレームワーク）です。"},
    {"term": "Vercel", "desc": "Next.js で作ったアプリをインターネットに公開して動かしてくれるサービスです。"},
    {"term": "認証", "desc": "利用者が本人かどうかを確かめること。いわゆるログインです。"}
  ],
  "log": [
    {"date": "2026-09-12", "view": "plan", "text": "最初の計画を作成（9 個の箱）"},
    {"date": "2026-09-20", "view": "built", "text": "レシピ画面・APIサーバー・データベースを実装"},
    {"date": "2026-09-28", "view": "built", "text": "アクセス解析を計画外で追加"},
    {"date": "2026-10-02", "view": "built", "text": "ログイン機能を実装（テスト 1 件が失敗中）"},
    {"date": "2026-10-03", "view": "built", "text": "図を上から下への流れに描き直し、開発用スクリプトを実装用の道具として分けた"}
  ]
};
