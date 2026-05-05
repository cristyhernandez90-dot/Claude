from string_utils import count_vowels, is_palindrome, reverse_string, word_count


def test_reverse_string():
    assert reverse_string("hello") == "olleh"
    assert reverse_string("") == ""
    assert reverse_string("a") == "a"


def test_word_count():
    assert word_count("hello world") == 2
    assert word_count("") == 0
    assert word_count("one two three four") == 4
    assert word_count("   spaced   out   ") == 2


def test_is_palindrome():
    assert is_palindrome("racecar") is True
    assert is_palindrome("Hello") is False
    assert is_palindrome("A man a plan a canal Panama") is True
    assert is_palindrome("") is True


def test_count_vowels():
    assert count_vowels("hello") == 2
    assert count_vowels("AEIOU") == 5
    assert count_vowels("xyz") == 0
    assert count_vowels("") == 0
    assert count_vowels("Programming") == 3
