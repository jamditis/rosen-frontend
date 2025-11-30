import pathlib
import py_compile


def test_analyze_key_concepts_has_valid_syntax():
    script_path = pathlib.Path(__file__).resolve().parents[1] / "src" / "analyze_key_concepts.py"
    py_compile.compile(str(script_path), doraise=True)
