from app.api.v1.vision import _ask


def test_the_typed_instruction_goes_to_the_model_as_the_users_words() -> None:
    assert _ask(None) == "Extract the tasks and habits from this image."
    assert _ask("   ") == "Extract the tasks and habits from this image."
    assert _ask(" for next week ").endswith("instruction: for next week")
