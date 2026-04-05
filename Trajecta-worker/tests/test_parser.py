import os
import tempfile
from unittest import TestCase

from trajecta_worker.parser import parse_log


class ParserTests(TestCase):
    def test_parse_log_invalid_bin_raises_parse_error(self) -> None:
        fd, path = tempfile.mkstemp(suffix=".bin")
        os.close(fd)
        try:
            with open(path, "wb") as target:
                target.write(b"corrupted-not-dataflash-content")

            with self.assertRaises(ValueError) as context:
                parse_log(path)

            self.assertIn("Parse error", str(context.exception))
        finally:
            os.remove(path)
