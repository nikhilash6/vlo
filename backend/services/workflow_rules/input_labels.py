def default_input_label(input_type: str) -> str:
    if input_type == "text":
        return "Prompt"
    if input_type == "image":
        return "Image"
    if input_type == "audio":
        return "Audio"
    return "Video"
