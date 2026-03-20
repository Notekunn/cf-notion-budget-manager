#!/usr/bin/env python3
"""Extract transactions from password-protected Cake (VPBank) credit card statement PDFs to CSV."""

import argparse
import csv
import re
import sys
import tempfile
from pathlib import Path

import pdfplumber
import pikepdf

# Regex: transaction_date  post_date  description  amount
TRANSACTION_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-\d,]+)$"
)

START_MARKER = "Transaction description"


def unlock_pdf(pdf_path: str, password: str) -> str:
    """Unlock password-protected PDF, return path to temp decrypted file."""
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    with pikepdf.open(pdf_path, password=password) as pdf:
        pdf.save(tmp.name)
    return tmp.name


def extract_text(pdf_path: str) -> str:
    """Extract all text from PDF pages."""
    texts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                texts.append(text)
    return "\n".join(texts)


def parse_transactions(text: str) -> list[dict]:
    """Parse transaction lines from extracted text."""
    lines = text.split("\n")

    # Skip everything before start marker
    started = False
    transactions = []

    for line in lines:
        line = line.strip()
        if not started:
            if START_MARKER in line:
                started = True
            continue

        match = TRANSACTION_RE.match(line)
        if not match:
            continue

        transaction_date, post_date, description, amount_str = match.groups()
        amount = int(amount_str.replace(",", ""))

        transactions.append({
            "transaction_date": transaction_date,
            "post_date": post_date,
            "description": description,
            "amount": amount,
        })

    return transactions


def write_csv(transactions: list[dict], output=None):
    """Write transactions to CSV file or stdout."""
    fieldnames = ["transaction_date", "post_date", "description", "amount"]

    if output:
        f = open(output, "w", newline="", encoding="utf-8")
    else:
        f = sys.stdout

    try:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(transactions)
    finally:
        if output:
            f.close()


def main():
    parser = argparse.ArgumentParser(
        description="Extract transactions from Cake credit card statement PDF to CSV"
    )
    parser.add_argument("pdf_path", help="Path to the PDF statement file")
    parser.add_argument("--password", required=True, help="PDF password")
    parser.add_argument("--output", "-o", help="Output CSV file path (default: stdout)")
    args = parser.parse_args()

    if not Path(args.pdf_path).exists():
        print(f"Error: File not found: {args.pdf_path}", file=sys.stderr)
        sys.exit(1)

    # Unlock and extract
    decrypted_path = unlock_pdf(args.pdf_path, args.password)
    try:
        text = extract_text(decrypted_path)
    finally:
        Path(decrypted_path).unlink(missing_ok=True)

    # Parse and output
    transactions = parse_transactions(text)

    if not transactions:
        print("Warning: No transactions found in PDF", file=sys.stderr)

    write_csv(transactions, args.output)

    if transactions:
        print(f"Extracted {len(transactions)} transactions", file=sys.stderr)


if __name__ == "__main__":
    main()
