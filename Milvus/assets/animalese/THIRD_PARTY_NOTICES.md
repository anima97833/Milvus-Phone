# Third-Party Notices

All TypeScript and Python source code in `src/`, `scripts/`, and `tests/` of **Animalese Voice Mix** is an original clean-room implementation licensed under the **MIT License** (see [`LICENSE`](./LICENSE)).

All bundled voice bank audio sprites and trilingual pronunciation lexicons in `speech/` are built exclusively from permissively licensed open-source resources:

---

## 1. Trilingual Syllable Sprite Banks (`speech/{zh,en,ja}.{ogg,json}`)

- **Mandarin (`zh.ogg`, 407 units)**: Generated via [`scripts/build-voice-bank.py`](./scripts/build-voice-bank.py) using **[Kokoro-82M v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)** (`zf_001`) + **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** (**Apache-2.0**).
- **English (`en.ogg`, 525 units) & Native Japanese (`ja.ogg`, 115 morae)**: Generated via [`scripts/build-voice-bank.py`](./scripts/build-voice-bank.py) using **[Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M)** (`af_heart` for English, `jf_alpha` for native Japanese) via `kokoro-onnx` (**Apache-2.0** / **MIT**).
- All banks are pitch-flattened to `364 Hz` and time-compressed cleanly via Praat PSOLA (`praat-parselmouth`).

## 2. Trilingual Pronunciation Lexicons (`speech/{zh,en,ja}-lexicon.json`)

- **Chinese Hanzi (`zh-lexicon.json`)**: Derived from [pypinyin](https://github.com/mozillazg/python-pinyin) / [pinyin-data](https://github.com/mozillazg/pinyin-data) (**MIT**) & Unicode Unihan (**[Unicode License v3](https://www.unicode.org/license.txt)**).
- **English IPA (`en-lexicon.json`)**: Generated via [`scripts/build-lexicons.py`](./scripts/build-lexicons.py) from Kokoro Misaki / [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (`lexicon-us-en.txt`, **Apache-2.0 / BSD**) filtered by [wordfreq](https://github.com/rspeer/wordfreq).
- **Japanese Kanji → Hiragana (`ja-lexicon.json`)**: Generated via [`scripts/build-lexicons.py`](./scripts/build-lexicons.py) from **[WorksApplications SudachiDict Core](https://github.com/WorksApplications/SudachiDict)** (**Apache-2.0**) filtered by [wordfreq](https://github.com/rspeer/wordfreq).
