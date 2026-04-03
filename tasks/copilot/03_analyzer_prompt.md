# 03 Implement Analyzer Prompt & JSON Output

目的: 画像を解析して補正対象の矩形を安定して取得できるようにする。

やることリスト:
- 解析プロンプトを設計する（JSONのみで矩形配列 [{x,y,w,h}] を返すよう明示）
- テスト用の代表画像セット（数枚）を用意する
- analyzer に渡すパラメータ（max_new_tokens 等）を決める
- 返却文字列のパースロジックを堅牢化（例外処理、異常系のログ）
- 解析結果が妥当でない場合の簡易フォールバック（全体補正やマスク優先）を実装する

検証:
- 複数画像で JSON が得られ、`JSON.parse` できること
- 得られた矩形が画面上で視覚確認できること（debug draw）

成果物:
- `tasks/copilot/artifacts/analyzer_samples.json` (解析サンプル)
- プロンプト文言のバージョン管理（ファイル）
