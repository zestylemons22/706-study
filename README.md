# MECHENG 705/706 Study App

This workspace contains a local web app for studying the supplied lecture slides, rote memorisation workbook, practice questions, and past exam papers.

## Run

```powershell
& "C:\Users\Alex\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 5173
```

Then open:

```text
http://localhost:5173/
```

## Rebuild Study Data

The generated data file is `data/study-data.json`. To rebuild it from the supplied PDFs and Excel workbook:

```powershell
$env:PYTHONPATH="C:\Users\Alex\.cache\codex-runtimes\codex-primary-runtime\dependencies\python"
$env:PYTHONIOENCODING="utf-8"
& "C:\Users\Alex\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tools\extract_study_data.py
```

By default, the extractor preserves a manually edited `data/study-data.json` and writes `data/study-data.generated.json` instead. Only run with `--force` when you intentionally want to replace the live edited dataset.

## Source Notes

The app currently uses the files listed in the original request: lecture PDFs, practice questions, past exams, and `MECHENG705_rote_memorisation_cards.xlsx`.

`AGENTS.md` asks for references to the initial assignment document where relevant. No initial assignment document was present in this workspace or included in the supplied file list, so the generated data records that as a missing source slot rather than silently mixing in unrelated assignment PDFs from Downloads.

## Share With GitHub Pages

This is a static site. Once the repository is pushed to GitHub, the workflow in `.github/workflows/pages.yml` publishes these app assets to GitHub Pages:

- `index.html`
- `src/`
- `data/study-data.json`
- `vendor/mathjax/`

The workflow does not regenerate `data/study-data.json`, so manual summary edits stay in the shared site. If you later rebuild the extracted dataset, review `data/study-data.generated.json` first and only replace the live file intentionally.
