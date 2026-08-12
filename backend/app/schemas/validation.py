def utf8_size(value: str) -> int:
    """Return a string's UTF-8 byte size or raise a stable validation error."""
    try:
        return len(value.encode("utf-8"))
    except UnicodeEncodeError as exc:
        raise ValueError("Value must be valid UTF-8") from exc
