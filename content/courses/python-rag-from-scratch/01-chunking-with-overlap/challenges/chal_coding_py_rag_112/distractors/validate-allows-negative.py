# @piece validate: Refuse sizes that cannot make windows
if size < 1 or overlap >= size:
    raise ValueError(f"need size >= 1 and overlap < size, got size={size}, overlap={overlap}")
