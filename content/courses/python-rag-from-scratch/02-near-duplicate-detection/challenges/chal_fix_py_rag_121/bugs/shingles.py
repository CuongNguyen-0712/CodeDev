# @piece shingles: Every run of k consecutive tokens
return {tuple(words[i:i + k]) for i in range(len(words) - k)}
