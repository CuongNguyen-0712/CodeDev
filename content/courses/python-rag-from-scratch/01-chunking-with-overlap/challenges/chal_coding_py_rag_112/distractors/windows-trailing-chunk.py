# @piece windows: Start a window every size - overlap words
step = size - overlap
return [" ".join(words[i:i + size]) for i in range(0, len(words), step)]
