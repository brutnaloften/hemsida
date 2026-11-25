"""Print the raw text of each PDF page as a JSON array of strings (pypdf only; no poppler).

Usage: python3 extract-pdf-pages.py file.pdf
Normalisation lives in tools/lib/pdf-text.ts, not here.
"""
import json
import sys

from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
json.dump([page.extract_text() or "" for page in reader.pages], sys.stdout)
