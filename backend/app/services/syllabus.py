"""Server-side syllabus text extraction (the PDF never goes to Gemini, only its text)."""

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError


class SyllabusTextError(ValueError):
    """The upload has no usable text (not a PDF, encrypted, or scanned images only)."""


def pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise SyllabusTextError("Encrypted PDFs are not supported")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except SyllabusTextError:
        raise
    except (PdfReadError, ValueError, TypeError, KeyError, OSError) as exc:
        raise SyllabusTextError("Could not read the PDF") from exc
    text = text.strip()
    if not text:
        raise SyllabusTextError("No text found in the PDF. Paste the syllabus text instead.")
    return text
