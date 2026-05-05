"""Simple string utilities."""


def reverse_string(s: str) -> str:
    """Return the reverse of the given string."""
    return s[::-1]


def word_count(s: str) -> int:
    """Return the number of whitespace-separated words in s."""
    return len(s.split())


def is_palindrome(s: str) -> bool:
    """Return True if s reads the same forwards and backwards.

    Comparison is case-insensitive and ignores non-alphanumeric chars.
    """
    # TODO: implement palindrome check
    raise NotImplementedError


def count_vowels(s: str) -> int:
    """Return the number of vowels (a, e, i, o, u) in s, case-insensitive."""
    return sum(1 for ch in s.lower() if ch in "aeiou")
