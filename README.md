# 🎨 NpureStudio

**NpureStudio** は、iPhoneの強力な **NPU (Neural Processing Unit)** のポテンシャルを、Safari（WebGPU）を通じて最大限に引き出すために設計された、次世代のオンデバイスAI画像生成プラットフォームです。

---

## ✨ コンセプト
「Draw Things」などの既存アプリの制約（単一キャンバス、自由度の低いレイアウト）を打ち破り、**「試着もできる、自由なAIクリエイティブ空間」**をWebブラウザ上で実現します。

- **Pure NPU:** クラウドサーバーを使わず、手元のiPhoneのパワーだけで演算。
- **Auto Masking:** 手動のマスク塗りは不要。AIが被写体や衣服を自動認識。
- **Multi-Canvas:** 人物写真、参照画像、生成結果を自由なレイアウトで配置。

## 🛠 技術スタック (Planned)
- **Engine:** WebGPU / Transformers.js v3
- **Models:** Stable Diffusion XL Turbo / Segment Anything (SAM) / IP-Adapter
- **Frontend:** HTML5 / JavaScript (Modern ES) / Tailwind CSS

## 📅 ロードマップ
- [ ] **Phase 1:** WebGPU 疎通確認テスト（Safari 26対応）
- [ ] **Phase 2:** Text-to-Image 基本エンジンの実装
- [ ] **Phase 3:** 自動セグメンテーションによる「魔法の着せ替え」モード
- [ ] **Phase 4:** 背景チェンジ・スタイル転送機能の統合

---
Developed with ❤️ for the future of On-Device AI.
